const { SourceMapDevToolPlugin } = require("webpack")
const { CleanWebpackPlugin } = require("clean-webpack-plugin")
const CopyWebpackPlugin = require("copy-webpack-plugin")

const MiniCssExtractPlugin = require("mini-css-extract-plugin")
const HtmlWebpackPlugin = require("html-webpack-plugin")
const path = require("path")

const APP_URL = "http://localhost"

const PATHS = {
    root: path.resolve(__dirname),
    src: path.resolve(__dirname, "./src"),
    build: path.resolve(__dirname, "./build"),
}

module.exports = {
    mode: "development",
    entry: { app: "./src/js/index.js" },
    devtool: "inline-source-map",
    output: {
        filename: "[name].[hash].js",
        path: PATHS.build,
        publicPath: "/",
    },

    plugins: [
        new CleanWebpackPlugin({
            dry: false,
            verbose: true,
        }),
        new MiniCssExtractPlugin({
            filename: "app.[contenthash].css",
        }),
        new HtmlWebpackPlugin({
            inject: false,
            template: './src/index.html'
        }),
        new CopyWebpackPlugin([
            {
                from: path.resolve(PATHS.src, "models"),
                to: path.resolve(PATHS.build, "models"),
            },
        ]),
        new SourceMapDevToolPlugin({
            append: `\n//# sourceMappingURL=${APP_URL}/[url]`,
        }),
    ],

    resolve: {
        extensions: [".ts", ".tsx", ".js"],
    },

    module: {
        rules: [
            { test: /\.worker\.js$/, use: { loader: "worker-loader" } },
            { test: /\.ts$/, loader: "ts-loader" },
            {
                test: /\.js$/,
                exclude: /(node_modules)/,
                use: ["babel-loader"],
            },
            {
                test: /\.styl$/,
                use: [
                    "style-loader",
                    MiniCssExtractPlugin.loader,
                    "css-loader",
                    "postcss-loader",
                    "stylus-loader",
                ],
            },
            { test: /\.(png|jpg|jpeg|svg)$/, use: ["url-loader"] },
            { test: /\.(gif|ttf|eot|woof|woff2)/, use: ["file?name=[path][name].[ext]?[hash]"] },
        ],
    },

    devServer: {
        host: "192.168.1.224",
        watchContentBase: true,
        // writeToDisk: true,
        publicPath: "/",
    },
}