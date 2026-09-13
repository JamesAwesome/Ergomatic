import {createRequire} from 'node:module';
const root='/Users/james/projects/github/jamesawesome/Ergomatic/.claude/worktrees/apple-client-plan-scratch/app';
const require=createRequire(root+'/package.json');
const {build}=await import(require.resolve('vite'));
const {default:react}=await import(require.resolve('@vitejs/plugin-react'));
await build({root,configFile:false,cacheDir:'/tmp/apple-code-lens/vite-cache',plugins:[react()],build:{outDir:'/tmp/apple-code-lens/dist',emptyOutDir:true}});
