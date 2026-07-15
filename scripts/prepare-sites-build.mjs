import { cp, mkdir, writeFile } from 'node:fs/promises'

await mkdir('dist/server', { recursive: true })
await mkdir('dist/.openai', { recursive: true })

await cp('.openai/hosting.json', 'dist/.openai/hosting.json')

await writeFile(
  'dist/server/index.js',
  `export default {
  async fetch(request, env) {
    let response = await env.ASSETS.fetch(request);
    if (response.status === 404 && request.method === 'GET') {
      const url = new URL(request.url);
      if (!url.pathname.split('/').at(-1).includes('.')) {
        response = await env.ASSETS.fetch(new Request(new URL('/index.html', request.url), request));
      }
    }
    return response;
  },
};
`,
)
