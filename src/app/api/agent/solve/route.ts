import {NextResponse} from "next/server";
import {db} from "@/lib/db";
import {getCurrentUser} from "@/lib/auth";
import {GitHubClient} from "@/integrations/github/client";
import {CompatibleAIProvider} from "@/integrations/ai/provider";

export async function POST(req:Request){
  const user=await getCurrentUser();
  if(!user)return NextResponse.json({error:"Unauthorized"},{status:401});
  const {bountyId,attemptId}=await req.json();
  const bounty=await db.bounty.findUnique({where:{id:bountyId}});
  if(!bounty)return NextResponse.json({error:"Bounty not found"},{status:404});
  if(!user.githubAccessToken)return NextResponse.json({error:"Reconnect GitHub to enable solver."},{status:401});

  let attempt=null;
  if(attemptId){
    attempt=await db.attempt.findFirst({where:{id:attemptId,userId:user.id,bountyId}});
    if(!attempt)return NextResponse.json({error:"Attempt not found"},{status:404});
    await db.attempt.update({where:{id:attempt.id},data:{status:"solving"}});
  }

  const run=await db.agentRun.create({data:{userId:user.id,bountyId,type:"coding",status:"running",provider:process.env.AI_PROVIDER||"compatible",model:process.env.GEMINI_MODEL||process.env.AI_MODEL||"configured",startedAt:new Date(),inputSummary:`${bounty.owner}/${bounty.repository}#${bounty.issueNumber}`}});
  try{
    const gh=new GitHubClient(user.githubAccessToken);
    const meta=await gh.repo(bounty.owner,bounty.repository);
    const tree=await gh.tree(bounty.owner,bounty.repository,meta.default_branch);
    const paths=(tree.tree||[]).filter((x:any)=>x.type==="blob"&&/\.(ts|tsx|js|jsx|py|go|rs|java|md|json)$/.test(x.path)).slice(0,8).map((x:any)=>x.path);
    const files:any[]=[];
    for(const path of paths){try{const c=await gh.contents(bounty.owner,bounty.repository,path,meta.default_branch);if(c.content)files.push({path,content:Buffer.from(c.content,"base64").toString("utf8")})}catch{}}
    const ai=new CompatibleAIProvider();
    const result=await ai.generatePatch({issue:`${bounty.title}\n${bounty.description}`,repo:`${bounty.owner}/${bounty.repository}`,files:files.map(f=>`${f.path}\n${f.content.slice(0,12000)}`)});
    await db.agentRun.update({where:{id:run.id},data:{status:"completed",output:result,confidence:70,finishedAt:new Date()}});
    if(attempt)await db.attempt.update({where:{id:attempt.id},data:{status:"solving"}});
    return NextResponse.json({runId:run.id,plan:result});
  }catch(e){
    const message=e instanceof Error?e.message:"Solver failed";
    await db.agentRun.update({where:{id:run.id},data:{status:"failed",error:message,finishedAt:new Date()}});
    if(attempt)await db.attempt.update({where:{id:attempt.id},data:{status:"failed"}});
    return NextResponse.json({error:message,runId:run.id},{status:502});
  }
}
