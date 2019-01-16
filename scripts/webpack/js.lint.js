module.exports = function () {
  return {
    module: {
      rules: [
        {
          test: /\.js$/,
          // include: paths,
          enforce: 'pre',
          loader: 'eslint-loader'
        }
      ]
    }
  }
}
