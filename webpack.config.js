const NodePolyfillPlugin = require('node-polyfill-webpack-plugin');

module.exports = function(options) {
  return {
    ...options,
    plugins: [
      ...(options.plugins || []),
      new NodePolyfillPlugin()
    ],
    optimization: {
      minimize: false
    }
  };
}; 