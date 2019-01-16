module.exports = function (paths) {
  return {
    module: {
      rules: [
        {
          test: /\.css$/,
          include: paths,
          use: [
            'style-loader',
            'css-loader'
          ]
        },
        {
          test: /\.less$/,
          include: paths,
          use: [
            'style-loader',
            'css-loader',
            'less-loader'
          ]
        },
        {
          test: /\.styl$/,
          include: paths,
          use: [
            'style-loader',
            'css-loader',
            'stylus-loader'
          ]
        }
      ]
    }
  }
}
