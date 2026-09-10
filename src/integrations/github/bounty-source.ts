import type { Bounty, BountyVerification } from "@/lib/bounty/types";
import { verifyRewardEvidence } from "@/lib/bounty/reward";

export interface BountySearchFilters { query?: string; minReward?: number; technologies?: string[]; paidOnly?: boolean; verifiedOnly?: boolean; }
export interface BountySource { name: string; search(filters: BountySearchFilters): Promise<Bounty[]>; getBounty(id: string): Promise<Bounty | null>; verify(bounty: Bounty): Promise<BountyVerification>; }

const TECHNOLOGIES = ["typescript","javascript","python","java","go","rust","c++","c#","php","ruby","swift","kotlin","react","next.js","nextjs","node.js","node","express","vue","angular","svelte","django","flask","fastapi","spring","rails","laravel","postgresql","postgres","mysql","mongodb","redis","sqlite","docker","kubernetes","terraform","aws","gcp","azure","graphql","rest","github actions"];
const SEARCH_CACHE_TTL = 5 * 60 * 1000;
const searchCache = new Map<string, { expiresAt: number; data: Bounty[] }>();

function detectTechnologies(text:string,labels:string[]):string[]{const haystack=`${text} ${labels.join(" ")}`.toLowerCase();return [...new Set(TECHNOLOGIES.filter(t=>{const i=haystack.indexOf(t);if(i<0)return false;const b=haystack[i-1]??" ",a=haystack[i+t.length]??" ";return !/[a-z0-9]/i.test(b)||!/[a-z0-9]/i.test(a)}))];}
function mapIssue(issue:any,owner:string,name:string,verification?:ReturnType<typeof verifyRewardEvidence>):Bounty{const labels=(issue.labels??[]).map((l:any)=>typeof l==="string"?l:l.name).filter(Boolean);const description=issue.body??"";const reward=verification?.paid?{amount:verification.amount,currency:verification.currency}:null;return{id:`github:${owner}/${name}#${issue.number}`,source:verification?.source==="algora"?"algora":"github",sourceUrl:issue.html_url,repository:{owner,name,url:`https://github.com/${owner}/${name}`},issue:{number:issue.number,url:issue.html_url,title:issue.title,description},reward:reward??{amount:0,currency:"USD"},status:"open",labels,technologies:detectTechnologies(`${issue.title}\n${description}`,labels),discoveredAt:new Date().toISOString(),updatedAt:issue.updated_at,signals:{comments:Number(issue.comments??0),reactions:Number(issue.reactions?.total_count??0),assignees:Array.isArray(issue.assignees)?issue.assignees.length:0,hasLinkedPullRequest:Boolean(issue.pull_request?.html_url),createdAt:issue.created_at,rewardVerified:Boolean(verification?.verified),rewardConfidence:verification?.confidence??0,rewardSource:verification?.source??"none"}};}

export class GitHubBountySource implements BountySource{
  name="github";
  private token:string|undefined;
  constructor(token?:string){this.token=token||process.env.GITHUB_TOKEN;}

  private async request<T>(url:string):Promise<T>{
    const res=await fetch(url,{headers:{Accept:"application/vnd.github+json",...(this.token?{Authorization:`Bearer ${this.token}`}:{})},next:{revalidate:300}});
    if(!res.ok){
      if(res.status===403||res.status===429){
        const remaining=res.headers.get("x-ratelimit-remaining");
        const reset=res.headers.get("x-ratelimit-reset");
        const retryAfter=res.headers.get("retry-after");
        const resetText=reset?` Retry after ${new Date(Number(reset)*1000).toISOString()}.`:"";
        throw new Error(`GitHub API rate limit exceeded.${remaining!==null?` Remaining: ${remaining}.`:""}${retryAfter?` Retry-After: ${retryAfter}s.`:""}${resetText}`);
      }
      throw new Error(`GitHub API error ${res.status}: ${res.statusText}`);
    }
    return res.json();
  }

  private async comments(owner:string,repo:string,n:number):Promise<string[]>{const data=await this.request<any[]>(`https://api.github.com/repos/${owner}/${repo}/issues/${n}/comments?per_page=100`);return data.map(x=>String(x.body??"")).filter(Boolean);}
  private async enrich(issue:any,owner:string,name:string):Promise<Bounty>{const comments=await this.comments(owner,name,issue.number);const verification=verifyRewardEvidence(`${issue.title}\n${issue.body??""}`,comments);return mapIssue(issue,owner,name,verification);}

  async search(filters:BountySearchFilters={}):Promise<Bounty[]>{
    const cacheKey=JSON.stringify(filters);
    const cached=searchCache.get(cacheKey);
    if(cached&&cached.expiresAt>Date.now())return cached.data;

    const terms=["bounty","reward","paid","algora",filters.query].filter(Boolean);
    const query=`(${terms.map(x=>`(${x})`).join(" OR ")}) is:issue is:open`;
    const response=await this.request<{items:any[]}>(`https://api.github.com/search/issues?q=${encodeURIComponent(query)}&sort=updated&order=desc&per_page=20`);
    const issues=response.items??[];

    const enriched:Bounty[]=[];
    for(let i=0;i<issues.length;i+=4){
      const batch=issues.slice(i,i+4);
      const results=await Promise.all(batch.map(async issue=>{const parts=String(issue.repository_url).split("/");return this.enrich(issue,parts.at(-2)!,parts.at(-1)!);}));
      enriched.push(...results);
    }

    const data=enriched.filter(b=>!filters.paidOnly||b.reward.amount>0).filter(b=>!filters.verifiedOnly||Boolean(b.signals?.rewardVerified)).filter(b=>!filters.minReward||b.reward.amount>=filters.minReward).filter(b=>!filters.technologies?.length||filters.technologies.some(t=>b.technologies.map(x=>x.toLowerCase()).includes(t.toLowerCase())));
    searchCache.set(cacheKey,{expiresAt:Date.now()+SEARCH_CACHE_TTL,data});
    return data;
  }

  async getBounty(id:string):Promise<Bounty|null>{const m=id.match(/^github:(.+)#(\d+)$/);if(!m)return null;const[owner,repo]=m[1].split("/");const issue=await this.request<any>(`https://api.github.com/repos/${owner}/${repo}/issues/${m[2]}`);const bounty=await this.enrich(issue,owner,repo);return{...bounty,status:issue.state==="open"?"open":"completed"};}
  async verify(bounty:Bounty):Promise<BountyVerification>{const active=bounty.status==="open",paid=bounty.reward.amount>0,verified=Boolean(bounty.signals?.rewardVerified),confidence=Number(bounty.signals?.rewardConfidence??0);const reasons=[active?"Issue is currently open.":"Issue is not open.",verified?`Monetary reward verified with ${confidence}% confidence.`:paid?"A monetary reward was detected but not fully verified.":"No monetary reward was verified.",bounty.signals?.rewardSource==="algora"?"Algora bounty command evidence was found in GitHub comments.":""].filter(Boolean);return{bountyConfidence:active&&verified?95:active&&paid?65:active?20:5,paymentConfidence:verified?confidence:paid?60:0,availabilityConfidence:active?90:5,reasons,verifiedAt:new Date().toISOString()};}
}
