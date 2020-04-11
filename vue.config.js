const path = require("path")

module.exports = {
    publicPath: "/",

    devServer: {
        host: "0.0.0.0",
        watchContentBase: true,
    },

    chainWebpack: config => {
        const types = ["vue-modules", "vue", "normal-modules", "normal"]

        types.forEach(type => addStyleResource(config.module.rule("stylus").oneOf(type)))

        config.module
            .rule("images")
            .use("url-loader")
            .loader("url-loader")
            .tap(options => Object.assign(options, { limit: 10240 }))
    },

    pluginOptions: {
      'style-resources-loader': {
        preProcessor: 'stylus',
        patterns: []
      }
    }
}

function addStyleResource(rule) {
    rule.use("style-resource")
        .loader("style-resources-loader")
        .options({
            patterns: [
                path.resolve(__dirname, "./src/styles/imports.styl"),
            ],
        })
}
