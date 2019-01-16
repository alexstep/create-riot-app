const dotenv = require('dotenv')
const path   = require('path')

const DefinePlugin = require('webpack').DefinePlugin

module.exports = function (file) {
  dotenv.config({ path: path.resolve(file) })

  return {
    plugins: [
      new DefinePlugin({
        'process.env': JSON.stringify(process.env)
      })
    ]
  }
}
