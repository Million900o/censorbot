const path = require('path');
const TerserPlugin = require('terser-webpack-plugin')

module.exports = {
  devtool: "source-map",
  entry: './build/tsc/index.js',
  output: {
    filename: 'build.js',
    path: path.resolve(__dirname, 'static')
  },
  optimization: {
    minimizer: [
      new TerserPlugin({
        terserOptions: {
          ecma: 5,
          sourceMap: true,
          mangle: {
            toplevel: true
          },
          compress: {
            arguments: true,
            hoist_props: true,
            keep_fargs: false,
            unsafe: true
          }
        }
      })
    ]
  }
};