export class GitHubClient {
  constructor(private token:string){if(!token)throw new Error("GitHub authorization is required.")}
  async request<T>(path:string,init:RequestInit={}){const res=await fetch(`https://api.github.com${path}`,{...init,headers:{Accept:"application/vnd.github+json",Authorization:`Bearer ${this.token}`,"X-GitHub-Api-Version":"2022-11-28",...(init.headers||{})}});if(!res.ok){const text=await res.text();throw new Error(`GitHub ${res.status}: ${text.slice(0,300)}`)}return res.json() as Promise<T>}
  repo(owner:string,name:string){return this.request<any>(`/repos/${owner}/${name}`)}
  issue(owner:string,name:string,n:number){return this.request<any>(`/repos/${owner}/${name}/issues/${n}`)}
  comments(owner:string,name:string,n:number){return this.request<any[]>(`/repos/${owner}/${name}/issues/${n}/comments?per_page=100`)}
  prs(owner:string,name:string,n:number){return this.request<any[]>(`/repos/${owner}/${name}/pulls?state=open&per_page=100`)}
  async tree(owner:string,name:string,sha:string){return this.request<any>(`/repos/${owner}/${name}/git/trees/${sha}?recursive=1`)}
  async contents(owner:string,name:string,path:string,ref?:string){return this.request<any>(`/repos/${owner}/${name}/contents/${path}${ref?`?ref=${encodeURIComponent(ref)}`:""}`)}
  async branch(owner:string,name:string,branch:string){return this.request<any>(`/repos/${owner}/${name}/git/ref/heads/${encodeURIComponent(branch)}`)}
  async createBranch(owner:string,name:string,branch:string,sha:string){return this.request<any>(`/repos/${owner}/${name}/git/refs`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({ref:`refs/heads/${branch}`,sha})})}
  async putFile(owner:string,name:string,path:string,content:string,branch:string,message:string,sha?:string){return this.request<any>(`/repos/${owner}/${name}/contents/${path}`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({message,content:Buffer.from(content).toString("base64"),branch,...(sha?{sha}:{})})})}
  async pr(owner:string,name:string,head:string,base:string,title:string,body:string){return this.request<any>(`/repos/${owner}/${name}/pulls`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({title,head,base,body})})}
}
