import {readFileSync,existsSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {compileFunction} from 'node:vm';
import ts from 'typescript';
const root=fileURLToPath(new URL('../../',import.meta.url)), cache=new Map();
// Load real component dependencies for server-render assertions; no UI stubs.
export function loadComponent(path){
 const candidate=resolve(root,path), file=[candidate,candidate+'.tsx',candidate+'.ts'].find(existsSync);
 if(!file) throw Error('Component dependency unavailable: '+path);
 if(cache.has(file))return cache.get(file).exports;
 const compiledModule={exports:{}};cache.set(file,compiledModule);const require=createRequire(file);
 const js=ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 compileFunction(js,['require','module','exports'])(id=>id.startsWith('@/')?loadComponent(id.slice(2)):id.startsWith('.')?loadComponent(resolve(dirname(file),id)):require(id),compiledModule,compiledModule.exports);
 return compiledModule.exports;
}
