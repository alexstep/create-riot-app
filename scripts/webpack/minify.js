const MinifyJSPlugin    = require('babel-minify-webpack-plugin')
const ExtractTextPlugin = require('extract-text-webpack-plugin')
const OptimizeCSSPlugin = require('optimize-css-assets-webpack-plugin')

module.exports = function (paths) {
  return {
    module: {
      rules: [
        {
          test: /\.less$/,
          include: paths,
          use: ExtractTextPlugin.extract({
            publicPath: '../',
            fallback: 'style-loader',
            use: ['css-loader','less-loader']
          })
        },
        {
          test: /\.styl$/,
          include: paths,
          use: ExtractTextPlugin.extract({
            publicPath: '../',
            fallback: 'style-loader',
            use: ['css-loader','stylus-loader']
          })
        },
        {
          test: /\.css$/,
          include: paths,
          use: ExtractTextPlugin.extract({
            fallback: 'style-loader',
            use: 'css-loader'
          })
        }
      ]
    },

    plugins: [
      new ExtractTextPlugin('./css/[name].css'),
      new MinifyJSPlugin()
    ],

    optimization: {
      minimizer:[
        new OptimizeCSSPlugin({
          removeConsole: true,
          removeDebugger: true
        },{
          comments:false
        })
      ]
    }
  }
}
