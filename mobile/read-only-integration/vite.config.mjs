import {defineConfig} from 'vite'
import {fileURLToPath} from 'node:url'
import {assertModule,CSP} from './importPolicy.mjs'
export {assertModule,CSP} from './importPolicy.mjs'
const root=fileURLToPath(new URL('.',import.meta.url)).replaceAll('\\','/')
export default defineConfig({root,publicDir:false,envDir:false,envPrefix:'C1_UNUSED_',cacheDir:root+'node_modules/.vite',server:{host:'127.0.0.1',port:5187,strictPort:true,hmr:false,headers:{'Content-Security-Policy':CSP}},preview:{host:'127.0.0.1',port:5187,strictPort:true,headers:{'Content-Security-Policy':CSP}},build:{outDir:'dist'},plugins:[{name:'c1-import-boundary',enforce:'pre',transform(code,id){assertModule(id);if(!id.replaceAll('\\','/').includes('/node_modules/')&&/import\.meta\.env|localStorage|sessionStorage|indexedDB/.test(code))throw Error('C1_ENV_OR_STORAGE_IMPORT');},generateBundle(){for(const id of this.getModuleIds())assertModule(id)}}]})
