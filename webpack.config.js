/* eslint-disable @typescript-eslint/no-var-requires */
// eslint-disable-next-line @typescript-eslint/no-var-requires
const path = require('path');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const RemovePlugin = require('remove-files-webpack-plugin');
// const { BundleAnalyzerPlugin } = require('webpack-bundle-analyzer');
const CompressionPlugin = require('compression-webpack-plugin');

const CSSModuleLoader = {
  loader: 'css-loader',
  options: {
    modules: {
      exportLocalsConvention: 'camelCaseOnly',
      localIdentName: '[name]-[local]-[hash:base64:5]',
    },
    sourceMap: true,
    // minimize: true,
  },
}

const CSSLoader = {
  loader: 'css-loader',
  options: {
    modules: false,
    sourceMap: true,
    // minimize: true,
  },
}

// const postCSSLoader = {
//   loader: 'postcss-loader',
//   options: {
//     ident: 'postcss',
//     sourceMap: true,
//     plugins: () => [
//       autoprefixer({
//         browsers: ['>1%', 'last 4 versions', 'Firefox ESR', 'not ie < 9'],
//       }),
//     ],
//   },
// }

const config = (name, env) => ({
  name,
  mode: env.production ? 'production' : 'development',
  devtool: env.production ? 'source-map' : 'inline-source-map',
  entry: {
    app: [
      './client-src/App.tsx',
      // './client-src/Categories/Home.tsx',
      // './client-src/AccountView/Accounts.tsx',
    ],
  },
  output: {
    path: path.resolve(__dirname, 'public'),
    filename: '[name].js',
    // clean: true,
  },
  optimization: {
    runtimeChunk: 'single',
    splitChunks: {
      cacheGroups: {
        vendors: {
          test: /[\\/]node_modules[\\/]/,
          name: 'vendors',
          chunks: 'all',
          // reuseExistingChunk: true,
        },
      },
    },
  },
  module: {
    rules: [
      { test: /.tsx?$/, use: 'ts-loader', exclude: /node_modules/ },
      {
        test: /\.module\.css$/,
        use: [
          MiniCssExtractPlugin.loader,
          CSSModuleLoader,
        ],
      },
      {
        test: /\.module\.scss$/,
        use: [
          MiniCssExtractPlugin.loader,
          CSSModuleLoader,
          'sass-loader',
        ],
      },
      {
        test: /\.css$/,
        exclude: /\.module\.css$/,
        use: [
          MiniCssExtractPlugin.loader,
          CSSLoader,
        ],
      },
      {
        test: /\.scss$/,
        exclude: /\.module\.scss$/,
        use: [
          MiniCssExtractPlugin.loader,
          CSSLoader,
          'sass-loader',
        ],
      },
    ],
  },
  plugins: [
    // new BundleAnalyzerPlugin({ analyzerMode: 'static', openAnalyzer: false }),
    new CompressionPlugin({
      threshold: 200 * 1024,
      deleteOriginalAssets: true,
      exclude: /.edge$/,
    }),
    new RemovePlugin({
      before: {
        test: [
          {
            folder: './public',
            method: (file) => (
              /.*\.css$/.test(file)
              || /.*\.css.map$/.test(file)
              || /.*\.css.map.gz$/.test(file)
              || /.*\.css.map$/.test(file)
              || /.*.js$/.test(file)
              || /.*.js.gz$/.test(file)
              || /.*.js.map$/.test(file)
              || /.*.js.map.gz$/.test(file)
            ),
            recursive: false,
          },
        ],
        exclude: ['public/service-worker.js', 'public/js', 'public/css'],
      },
    }),
    new MiniCssExtractPlugin({
      filename: '[name].[fullhash].css',
    }),
    new HtmlWebpackPlugin({
      inject: false,
      publicPath: '/',
      filename: '../resources/views/home-css.edge',
      templateContent: (param) => {
        let output = '';
        // eslint-disable-next-line no-restricted-syntax
        for (const file of param.htmlWebpackPlugin.files.css) {
          output += `<link rel="preload" href="${file}" as="style" onload="this.onload=null;this.rel='stylesheet'">\n`
        }

        return output;
      },
    }),
    new HtmlWebpackPlugin({
      inject: false,
      publicPath: '/',
      filename: '../resources/views/home-script.edge',
      templateContent: (param) => {
        let output = '';

        // eslint-disable-next-line no-restricted-syntax
        for (const file of param.htmlWebpackPlugin.files.js) {
          output += `<script src="${file}"></script>\n`
        }

        return output;
      },
    }),
  ],
  resolve: {
    extensions: ['.tsx', '.ts', '.js'],
  },
})

module.exports = [
  (env) => config('app', env),
];
