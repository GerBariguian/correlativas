import {fileURLToPath} from 'node:url'
import {contractFiles} from './contractImports.mjs'
const root=fileURLToPath(new URL('.',import.meta.url)).replaceAll('\\','/')
export const CSP="default-src 'self'; connect-src http://127.0.0.1:9199 http://127.0.0.1:8188; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; object-src 'none'; base-uri 'none'; form-action 'none'; frame-src 'none'; worker-src 'none'"
export function assertModule(id){id=id.replaceAll('\\','/').split('?')[0];if(id.startsWith('\0')||id.includes('/node_modules/'))return;if(/^[A-Za-z]:\//.test(id)||id.startsWith('/')){if(!id.startsWith(root)&&!contractFiles.includes(id))throw Error('C1_OUTSIDE_ENTRY_IMPORT: '+id)}}
