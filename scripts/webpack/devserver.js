module.exports = function () {
  return {
    devServer: {
      historyApiFallback: {
        index: 'index.html'
      },
      port: 9999,
      stats: 'errors-only',
      overlay: true
    }
  }
}
