import {createHash} from 'node:crypto';
import {readdir,readFile} from 'node:fs/promises';
// Only reproducible application/build inputs; no env, output, data or user files.
export const sourceDirectories=['app','components','lib','db','drizzle','public','patches','scripts','tests','.github/workflows'];
export const sourceFiles=['AGENTS.md','COMMUNITY.md','README.md','package.json','pnpm-lock.yaml','pnpm-workspace.yaml','tsconfig.json','env.d.ts','next.config.ts','vite.config.ts','proxy.ts','float-worker.ts','drizzle.config.ts','components.json','.oxlintrc.json','.oxfmtrc.json','.gitignore','wrangler.local.jsonc','.env.example','.openai/hosting.json'];
export async function sourcePaths(){
  const paths=[...sourceFiles];
  for(const directory of sourceDirectories){
    for(const entry of await readdir(directory,{recursive:true,withFileTypes:true})){
      if(entry.isFile()) paths.push(entry.parentPath+'/'+entry.name);
    }
  }
  return paths.sort();
}
export async function sourceFingerprint(){
  const hash=createHash('sha256');
  for(const path of await sourcePaths()){hash.update(path+'\0');hash.update(await readFile(path));hash.update('\0');}
  return hash.digest('hex');
}
