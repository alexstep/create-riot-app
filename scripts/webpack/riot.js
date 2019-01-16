// https://github.com/riot/tag-loader#usage-in-webpack--4
module.exports = function () {
  return {
    module: {
      rules: [
        {
          test: /\.tag$/,
          exclude: /node_modules/,
          use: [{
            loader: 'riot-tag-loader',
            options: {
              debug : true,
              type  : 'es6',
              hot   : false
            }
          }]
        }
      ]
    }
  }
}
