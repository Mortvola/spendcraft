/* eslint-disable @typescript-eslint/no-var-requires */
// eslint-disable-next-line @typescript-eslint/no-var-requires
const path = require('path');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const HtmlWebpackPlugin = require('html-webpack-plugin');

const config = (name, env) => ({
  name,
  mode: env.production ? 'production' : 'development',
  devtool: env.production ? 'source-map' : 'inline-source-map',
  entry: {
    app: './client-src/App.tsx',
  },
  output: {
    path: path.resolve(__dirname, 'public'),
    filename: '[name].js',
  },
  module: {
    rules: [
      { test: /.tsx?$/, use: 'ts-loader', exclude: /node_modules/ },
      {
        test: /\.css$/,
        use: [
          MiniCssExtractPlugin.loader,
          {
            loader: 'css-loader',
            options: {
              modules: {
                exportLocalsConvention: 'camelCaseOnly',
                localIdentName: '[name]-[local]-[hash:base64:5]',
              },
              importLoaders: 1,
            },
          },
        ],
        include: /\.module\.css$/,
      },
      {
        test: /\.css$/,
        use: [
          MiniCssExtractPlugin.loader,
          'css-loader',
        ],
        exclude: /\.module\.css$/,
      },
    ],
  },
  plugins: [
    new MiniCssExtractPlugin({
      filename: name === 'app' ? 'main.[fullhash].css' : 'welcome.css',
    }),
    new HtmlWebpackPlugin({
      inject: false,
      publicPath: '/',
      filename: `../resources/views/${name === 'app' ? 'home' : 'welcome'}-css.edge`,
      templateContent: (param) => (
        `<link rel="preload" href="${param.htmlWebpackPlugin.files.css}" as="style" onload="this.onload=null;this.rel='stylesheet'">`
      ),
    }),
    new HtmlWebpackPlugin({
      inject: false,
      publicPath: '/',
      filename: `../resources/views/${name === 'app' ? 'home' : 'welcome'}-script.edge`,
      templateContent: (param) => (
        `<script src="${param.htmlWebpackPlugin.files.js[0]}"></script>`
      ),
    }),
  ],
  resolve: {
    extensions: ['.tsx', '.ts', '.js'],
  },
})

module.exports = [
  (env) => config('app', env),
];
