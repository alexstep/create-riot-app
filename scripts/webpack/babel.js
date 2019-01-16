module.exports = function () {
  return {
    module: {
      rules: [
        {
          test: /\.js$/,
          // include : ['./src'],
          exclude: /(node_modules|bower_components)/,
          loader: 'babel-loader',
          options: {
            presets: [
              [
                '@babel/preset-env',
                {
                  targets: {
                    esmodules: true,
                    browsers: [
                      'last 2 versions'
                    ]
                  },
                  modules: false // Needed for tree shaking to work.
                }
              ]
            ]
          }
        }
      ]
    }
  }
}
