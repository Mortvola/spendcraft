/* eslint-disable @typescript-eslint/no-var-requires */
// eslint-disable-next-line @typescript-eslint/no-var-requires
const path = require('path');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const RemovePlugin = require('remove-files-webpack-plugin');

const CSSModuleLoader = {
  loader: 'css-loader',
  options: {
    modules: {
      exportLocalsConvention: 'camelCaseOnly',
      localIdentName: '[name]-[local]-[hash:base64:5]',
    },
    sourceMap: true,
    // localIdentName: '[local]__[hash:base64:5]',
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
    new RemovePlugin({
      before: {
        test: [
          {
            folder: './public',
            method: (file) => (name === 'app' ? /main\..*\.css/.test(file) : false),
            recursive: false,
          },
          {
            folder: './public',
            method: (file) => (name === 'welcome' ? /welcome\..*\.css/.test(file) : false),
            recursive: false,
          },
        ],
      },
    }),
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
