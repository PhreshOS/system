import babel from "@rolldown/plugin-babel"

export default function decoratorPlugin() {

    return babel({

        presets: [{

            preset: () => ({

                plugins: [["@babel/plugin-proposal-decorators", { version: "2023-11" }]]
            }),

            rolldown: {

                filter: { code: "@" }
            }
        }]
    })
}