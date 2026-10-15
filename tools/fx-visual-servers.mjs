// Local visual-review servers. Reference source is read only; all caches stay in clone-ui.
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

const workspace = process.cwd()
const reference = process.argv[2]
if (!reference) throw new Error('Pass the read-only ALM reference directory.')
const target = await createServer({ configFile: path.join(workspace, 'apps/web/vite.config.ts'), root: path.join(workspace, 'apps/web'), server: { host: '127.0.0.1', port: 5173, strictPort: true } })
await target.listen()
const alm = await createServer({
  configFile: false,
  root: reference,
  cacheDir: path.join(workspace, 'data/ui-review/alm-vite-cache'),
  plugins: [react()],
  resolve: { alias: ['react', 'react-dom', 'lucide-react', '@fontsource-variable/inter'].map(name => ({ find: name, replacement: path.join(workspace, 'node_modules', name) })) },
  server: { host: '127.0.0.1', port: 5177, strictPort: true, fs: { allow: [reference, workspace] } },
})
await alm.listen()
console.log('Clone: http://127.0.0.1:5173 | Read-only ALM: http://127.0.0.1:5177')
