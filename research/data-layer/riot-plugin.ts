import riot from 'rollup-plugin-riot'
import { transformWithOxc, type Plugin } from 'vite'

const HOT_RELOAD = `
if (import.meta.hot) {
  import.meta.hot.accept((mod) => {
    if (!mod || !mod.default) return
    import('@riotjs/hot-reload').then((modReload) => {
      const mounted = modReload.default(mod.default)
      const updated = Array.isArray(mounted) ? mounted.filter(Boolean) : []
      if (updated.length === 0) import.meta.hot.invalidate()
    })
  })
}
`

export function riotPlugin(): Plugin {
  const compiler = riot()
  let serve = false

  return {
    name: 'riot',
    enforce: 'pre',
    configResolved(config) {
      serve = config.command === 'serve'
    },
    async transform(code, id) {
      const file = id.split('?')[0] ?? id
      if (!file.endsWith('.riot')) return null
      const transform = compiler.transform
      if (!transform) return null
      const compiled = await transform.call(compiler, code, file)
      if (!compiled || typeof compiled === 'string' || !('code' in compiled) || !compiled.code) return null
      const stripped = await transformWithOxc(compiled.code, `${file}.ts`, { lang: 'ts' })
      return {
        code: serve ? `${stripped.code}\n${HOT_RELOAD}` : stripped.code,
        map: stripped.map,
      }
    },
  }
}
