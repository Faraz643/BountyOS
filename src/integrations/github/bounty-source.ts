import type { Bounty, BountyVerification } from "@/lib/bounty/types";
import { verifyRewardEvidence } from "@/lib/bounty/reward";

export interface BountySearchFilters { query?: string; minReward?: number; technologies?: string[]; paidOnly?: boolean; verifiedOnly?: boolean; }
export interface BountySource { name: string; search(filters: BountySearchFilters): Promise<Bounty[]>; getBounty(id: string): Promise<Bounty | null>; verify(bounty: Bounty): Promise<BountyVerification>; }

const TECHNOLOGIES = ["typescript","javascript","python","java","go","rust","c++","c#","php","ruby","swift","kotlin","react","next.js","nextjs","node.js","node","express","vue","angular","svelte","django","flask","fastapi","spring","rails","laravel","postgresql","postgres","mysql","mongodb","redis","sqlite","docker","kubernetes","terraform","aws","gcp","azure","graphql","rest","github actions"];
const SEARCH_CACHE_TTL = 5 * 60 * 1000;
const MAX_AGE_DAYS = Number(process.env.BOUNTY_MAX_AGE_DAYS || 30);
const MAX_INACTIVITY_DAYS = Number(process.env.BOUNTY_MAX_INACTIVITY_DAYS || 14);
const MAX_CANDIDATES_TO_VERIFY = Number(process.env.BOUNTY_MAX_CANDIDATES || 16);
const searchCache = new Map<string, { expiresAt: number; data: Bounty[] }>();

function detectTechnologies(text:string,labels:string[]):string[]{const haystack=`${text} ${labels.join(" ")}`.toLowerCase();return [...new Set(TECHNOLOGIES.filter(t=>{const i=haystack.indexOf(t);if(i<0)return false;const b=haystack[i-1]??" ",a=haystack[i+t.length]??" ";return !/[a-z0-9]/i.test(b)||!/[a-z0-9]/i.test(a)}))];}
function daysSince(value:string){return Math.max(0,(Date.now()-new Date(value).getTime())/86400000);}
const CLAIMED_PATTERN = /\b(?:i(?:'|’)m|i am|i'll|i will|we(?:'|’)ll|we will)\s+(?:take|handle|fix|work on|implement)|\b(?:claimed|assigned to me|working on (?:this|it)|on it|fixing this|implementing this|already fixed|fixed in|resolved in|implemented in|merged in|pr submitted|pull request opened|opened a pr|opened a pull request)\b/i;

function mapIssue(issue:any,owner:string,name:string,verification:any,strict:any):Bounty{
  const labels=(issue.labels??[]).map((l:any)=>typeof l==="string"?l:l.name).filter(Boolean);
  const description=issue.body??"";
  const reward=verification?.paid?{amount:verification.amount,currency:verification.currency}:{amount:0,currency:"USD"};
  return{id:`github:${owner}/${name}#${issue.number}`,source:verification?.source==="platform"?"algora":"github",sourceUrl:issue.html_url,repository:{owner,name,url:`https://github.com/${owner}/${name}`},issue:{number:issue.number,url:issue.html_url,title:issue.title,description},reward,status:"open",labels,technologies:detectTechnologies(`${issue.title}\n${description}`,labels),discoveredAt:new Date().toISOString(),updatedAt:issue.updated_at,signals:{comments:Number(issue.comments??0),reactions:Number(issue.reactions?.total_count??0),assignees:Array.isArray(issue.assignees)?issue.assignees.length:0,hasLinkedPullRequest:Boolean(strict.hasLinkedPullRequest),hasOpenPullRequest:Boolean(strict.hasOpenPullRequest),hasAnyPullRequest:Boolean(strict.hasAnyPullRequest),createdAt:issue.created_at,rewardVerified:Boolean(verification?.verified),rewardConfidence:Number(verification?.confidence??0),rewardSource:verification?.source??"none",issueAgeDays:Number(strict.issueAgeDays.toFixed(1)),inactivityDays:Number(strict.inactivityDays.toFixed(1)),strictEligible:Boolean(strict.eligible),exclusionReasons:strict.reasons}};
}

export class GitHubBountySource implements BountySource{
  name="github";
  private token:string|undefined;
  constructor(token?:string){this.token=token||process.env.GITHUB_TOKEN;}
  private async request<T>(url:string):Promise<T>{
    const res=await fetch(url,{headers:{Accept:"application/vnd.github+json","X-GitHub-Api-Version":"2026-03-10",...(this.token?{Authorization:`Bearer ${this.token}`}:{})},next:{revalidate:300}});
    if(!res.ok){
      if(res.status===403||res.status===429){const remaining=res.headers.get("x-ratelimit-remaining");const reset=res.headers.get("x-ratelimit-reset");const retryAfter=res.headers.get("retry-after");const resetText=reset?` Retry after ${new Date(Number(reset)*1000).toISOString()}.`:"";throw new Error(`GitHub API rate limit exceeded.${remaining!==null?` Remaining: ${remaining}.`:""}${retryAfter?` Retry-After: ${retryAfter}s.`:""}${resetText}`);}
      throw new Error(`GitHub API error ${res.status}: ${res.statusText}`);
    }
    return res.json();
  }
  private async comments(owner:string,repo:string,n:number):Promise<string[]>{const data=await this.request<any[]>(`https://api.github.com/repos/${owner}/${repo}/issues/${n}/comments?per_page=100`);return data.map(x=>String(x.body??"")).filter(Boolean);}
  private async timeline(owner:string,repo:string,n:number):Promise<any[]>{return this.request<any[]>(`https://api.github.com/repos/${owner}/${repo}/issues/${n}/timeline?per_page=100`);}

  private async inspect(issue:any,owner:string,name:string,requireVerified:boolean):Promise<Bounty|null>{
    const issueAgeDays=daysSince(issue.created_at), inactivityDays=daysSince(issue.updated_at);
    const reasons:string[]=[];
    if(issue.state!=="open") reasons.push("issue_not_open");
    if(issue.pull_request) reasons.push("issue_is_pull_request");
    if(Array.isArray(issue.assignees)&&issue.assignees.length>0) reasons.push("already_assigned");
    if(issueAgeDays>MAX_AGE_DAYS) reasons.push("too_old");
    if(inactivityDays>MAX_INACTIVITY_DAYS) reasons.push("inactive_too_long");
    if(reasons.length) return null;

    const timeline=await this.timeline(owner,name,issue.number);
    const linkedPrEvents=timeline.filter((e:any)=>e?.event==="cross-referenced"&&e?.source?.issue?.pull_request);
    if(linkedPrEvents.length>0) return null;

    const comments=await this.comments(owner,name,issue.number);
    if(comments.some(c=>CLAIMED_PATTERN.test(c))) return null;

    const verification=verifyRewardEvidence(`${issue.title}\n${issue.body??""}`,comments);
    if(!verification.paid) return null;
    if(requireVerified&&!verification.verified) return null;

    const strict={eligible:verification.verified,reasons:[],issueAgeDays,inactivityDays,hasLinkedPullRequest:false,hasOpenPullRequest:false,hasAnyPullRequest:false};
    return mapIssue(issue,owner,name,verification,strict);
  }

  async search(filters:BountySearchFilters={}):Promise<Bounty[]>{
    const requireVerified=Boolean(filters.verifiedOnly);
    const cacheKey=JSON.stringify({...filters,strict:true,maxAge:MAX_AGE_DAYS,maxInactive:MAX_INACTIVITY_DAYS,maxCandidates:MAX_CANDIDATES_TO_VERIFY});
    const cached=searchCache.get(cacheKey);if(cached&&cached.expiresAt>Date.now())return cached.data;
    const cutoff=new Date(Date.now()-MAX_AGE_DAYS*86400000).toISOString().slice(0,10);
    const activeCutoff=new Date(Date.now()-MAX_INACTIVITY_DAYS*86400000).toISOString().slice(0,10);
    const termQueries=[
      `("bounty" OR "reward" OR "paid") is:issue is:open no:assignee -linked:pr created:>=${cutoff} updated:>=${activeCutoff}`,
      `("algora" OR "/bounty") is:issue is:open no:assignee -linked:pr created:>=${cutoff} updated:>=${activeCutoff}`
    ];
    const queries=filters.query?termQueries.map(q=>`${q} "${filters.query}"`):termQueries;
    const responses=await Promise.all(queries.map(q=>this.request<{items:any[]}>(`https://api.github.com/search/issues?q=${encodeURIComponent(q)}&sort=updated&order=desc&per_page=20`)));
    const deduped=new Map<string,any>();
    for(const response of responses) for(const issue of response.items??[]) deduped.set(String(issue.html_url),issue);
    const issues=[...deduped.values()].sort((a,b)=>new Date(b.updated_at).getTime()-new Date(a.updated_at).getTime()).slice(0,MAX_CANDIDATES_TO_VERIFY);
    const eligible:Bounty[]=[];
    for(let i=0;i<issues.length;i+=2){
      const batch=issues.slice(i,i+2);
      const results=await Promise.all(batch.map(async issue=>{const parts=String(issue.repository_url).split("/");return this.inspect(issue,parts.at(-2)!,parts.at(-1)!,requireVerified);}));
      eligible.push(...results.filter((x):x is Bounty=>Boolean(x)));
    }
    const data=eligible.filter(b=>!filters.paidOnly||b.reward.amount>0).filter(b=>!filters.verifiedOnly||Boolean(b.signals?.rewardVerified)).filter(b=>!filters.minReward||b.reward.amount>=filters.minReward).filter(b=>!filters.technologies?.length||filters.technologies.some(t=>b.technologies.map(x=>x.toLowerCase()).includes(t.toLowerCase()))).sort((a,b)=>Number(b.signals?.rewardVerified)-Number(a.signals?.rewardVerified)||b.reward.amount-a.reward.amount||new Date(b.updatedAt).getTime()-new Date(a.updatedAt).getTime());
    searchCache.set(cacheKey,{expiresAt:Date.now()+SEARCH_CACHE_TTL,data});
    return data;
  }

  async getBounty(id:string):Promise<Bounty|null>{const m=id.match(/^github:(.+)#(\d+)$/);if(!m)return null;const[owner,repo]=m[1].split("/");const issue=await this.request<any>(`https://api.github.com/repos/${owner}/${repo}/issues/${m[2]}`);return this.inspect(issue,owner,repo,true);}
  async verify(bounty:Bounty):Promise<BountyVerification>{const active=bounty.status==="open",paid=bounty.reward.amount>0,verified=Boolean(bounty.signals?.rewardVerified),noPr=!bounty.signals?.hasAnyPullRequest,fresh=(bounty.signals?.issueAgeDays??999)<=MAX_AGE_DAYS&&(bounty.signals?.inactivityDays??999)<=MAX_INACTIVITY_DAYS,eligible=active&&paid&&verified&&noPr&&fresh;const reasons=[active?"Issue is currently open.":"Issue is not open.",verified?"Explicit bounty/reward evidence was found.":"No strict paid-reward evidence was found.",noPr?"No linked pull request was found in the issue timeline.":"A pull request is already linked.",fresh?"Issue is within the freshness window.":"Issue is too old or inactive.",eligible?"Eligible for strict bounty discovery.":"Excluded by strict eligibility rules."];return{bountyConfidence:eligible?98:10,paymentConfidence:verified?Number(bounty.signals?.rewardConfidence??0):0,availabilityConfidence:eligible?95:5,reasons,verifiedAt:new Date().toISOString()};}
}
