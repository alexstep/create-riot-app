const path = require('path')
const StyleLintPlugin = require('stylelint-webpack-plugin')

module.exports = function () {
  return {
    plugins: [
      new StyleLintPlugin({
        configFile: path.resolve('./') + '.stylelintrc'
      })
    ]
  }
}
