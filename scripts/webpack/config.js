const fs      = require('fs')
const path    = require('path')
const webpack = require('webpack')
const merge   = require('webpack-merge')

const HtmlWebpackPlugin          = require('html-webpack-plugin')
const ServiceWorkerWebpackPlugin = require('serviceworker-webpack-plugin')
const CopyWebpackPlugin          = require('copy-webpack-plugin')

const setEnv     = require('./env')
const devserver  = require('./devserver')
const sourceMap  = require('./sourceMap')
const babel      = require('./babel')
const riot       = require('./riot')
const images     = require('./images')
const css        = require('./css')
const minify     = require('./minify')
const lintCSS    = require('./less.lint')
const lintJS  = require('./js.lint')
// const favicon = require('./favicon')


let metaHtml = ''
try {
  const metaconf = require('../meta/config.js')
  metaHtml = fs.readFileSync(metaconf.files_dest + metaconf.html_filename)
} catch (e) {}


const paths = {
  source : path.resolve('src') + '/',
  build  : path.resolve('dist') + '/'
}

const base = merge([
  {
    node: {
      fs : 'empty',
      tls: 'empty',
      net: 'empty'
    },

    entry: {
      index: paths.source + 'index.web.js'
    },
    output: {
      path: paths.build,
      filename:'bundle.js',
      publicPath: '/'
    },

    resolve: {
      modules: [
        path.resolve('node_modules'),
        paths.source,
        paths.source + 'model/'
      ],
      extensions: ['.js', '.json', '.tag']
    },

    plugins: [
      new webpack.ProvidePlugin({
        riot:  'riot'
      }),

      new HtmlWebpackPlugin({
        inject: true,
        metaHtml: metaHtml,
        testHtml:'test',
        filename: 'index.html',
        template: paths.source + 'index.html'
      }),

      new CopyWebpackPlugin(
        [
          { from: paths.source + '/_static/', to: paths.build + '/' }
        ],
        {
          cache: true
        }
      ),

      new ServiceWorkerWebpackPlugin({
        entry: paths.source + '/index.SW.js'
      })
    ],

    optimization: {
      splitChunks: {
        cacheGroups: {
          vendors: {
            priority: -10,
            test: /[\\/]node_modules[\\/]/
          }
        },

        chunks: 'async',
        minChunks: 1,
        minSize: 30000,
        name: true
      }
    }
  },

  images(),
  babel(),
  riot(),
  lintJS(),
  lintCSS()
])


module.exports = function (env, argv) {
  if (argv.mode === 'production') {
    return merge([
      base, setEnv('.env.production'),
      minify()
      // favicon(),
    ])
  }
  if (argv.mode === 'development') {
    return merge([
      base, setEnv('.env'),
      devserver(), sourceMap(),
      css()
    ])
  }
}


