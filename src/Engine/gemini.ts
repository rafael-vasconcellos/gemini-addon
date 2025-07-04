import { PromptFeedback, GoogleGenerativeAIResponseError as IGoogleGenerativeAIResponseError, SchemaType as ISchemaType } from "@google/generative-ai"
import { ICustomEngineModule } from './custom'
import { IPromptModule } from './Prompt'
const { 
    GoogleGenerativeAI, 
    HarmCategory, 
    HarmBlockThreshold, 
    SchemaType
} = require("www/addons/gemini/lib/@google/generative-ai.js") as typeof import('@google/generative-ai');
const { CustomEngine, TranslationFailException } = require("www/addons/gemini/Engine/custom.js") as ICustomEngineModule;
const { systemPrompt, userPrompt, parseResponse } = require("www/addons/gemini/Engine/Prompt.js") as IPromptModule;




interface IGoogleFilterBlock { 
    text: CallableFunction // throws the error
    functionCall: CallableFunction
    functionCalls: CallableFunction
    usageMetadata: Record<string, unknown>
    promptFeedback: PromptFeedback
}

const safetySettings = [
    {
      category: HarmCategory.HARM_CATEGORY_HARASSMENT,
      threshold: HarmBlockThreshold.BLOCK_NONE,
    }, {
      category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
      threshold: HarmBlockThreshold.BLOCK_NONE,
    }, {
      category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
      threshold: HarmBlockThreshold.BLOCK_NONE,
    }, {
      category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
      threshold: HarmBlockThreshold.BLOCK_NONE,
    }
]

const batchSize = 25
const responseSchema: { 
    type: ISchemaType
    properties: Record<string, any>
    required?: string[]
} = { 
    type: SchemaType.OBJECT,
    properties: {}
}
for (let i=0; i<batchSize; i++) { 
    responseSchema.properties[`${i}`] = { type: "string" }
}
responseSchema.required = Object.keys(responseSchema.properties)


class EngineClient extends CustomEngine { 
    get model_name(): string { return this.getEngine()?.getOptions('model_name') ?? "gemini-1.5-flash" }

    constructor(thisAddon: Addon) { 
        trans.config.maxRequestLength = batchSize
        super({ 
            id: thisAddon.package.name,
            name: thisAddon.package.title,
            description: thisAddon.package.description,
            version: thisAddon.package.version,
            author: typeof thisAddon.package.author === 'object'? 
                thisAddon.package.author.name : thisAddon.package.author ?? '',
            maxRequestLength: trans.config.maxRequestLength,
            batchDelay: 1, // 0 is a falsy value, it'll be reverted to the default value (5000)
            optionsForm: { 
                schema: { 
                    api_key: { 
                        type: "string",
                        title: "API Key",
                        description: "Insert your Google's gemini API key",
                        required: true
                    },
                    api_type: { 
                        type: "string",
                        title: "Api type",
                        description: "Select your api type",
                        default: "free",
                        required: false,
                        enum: ["free", "pro"]
                    },
                    target_language: { 
                        type: "string",
                        title: "Target language",
                        description: "Choose the target language",
                        default: "English - US",
                        required: false
                    },
                    model_name: { 
                        type: "string",
                        title: "Model name",
                        description: "Choose the gemini model",
                        default: "gemini-2.5-flash",
                        required: false,
                        enum: [
                            "gemini-1.5-flash", "gemini-1.5-flash-8b", "gemini-2.0-flash", "gemini-2.0-flash-lite", "gemini-2.0-flash-thinking", "gemini-2.5-flash", 
                            "gemini-1.0-pro", "gemini-1.5-pro", "gemini-1.5-pro-latest", "gemini-2.0-pro-exp-02-05", "gemini-2.5-pro"
                        ]
                    }
                },

                form: [ 
                    { 
                        key: "api_key",
                        /* onChange: (evt: Event & { target: HTMLInputElement }) => { 
                            if (evt.target?.value) { this.api_key = evt.target.value }
                        } */
                    }, { 
                        key: "api_type"
                    }, { 
                        key: "model_name"
                    }, { 
                        key: "target_language"
                    }, 
                ],
                onChange: (elm: HTMLInputElement, key: string, value: unknown) => { 
                    this.update(key, value);
                    if (this.api_type==="free" && this.model_name.includes("pro")) { 
                        alert("you are using a pro model with a free key! The rate limit is way lower (100 requests per day).")
                    }
                }
            }

        })
    }

    public async fetcher(texts: string[]) { 
        const GoogleClient = new GoogleGenerativeAI(this.api_key as string)
        const generativeModel = GoogleClient.getGenerativeModel({ 
            model: this.model_name,
            systemInstruction: systemPrompt(this.target_language)
        })
        const parts = [
            { text: userPrompt(texts) },
        ]

        const response = (await generativeModel.generateContent({ 
            contents: [{ role: "user", parts }],
            generationConfig: { 
                temperature: 0, 
                responseMimeType: "application/json",
                responseSchema
            },
            safetySettings,
        })
        .catch( (e: IGoogleGenerativeAIResponseError<IGoogleFilterBlock>) => { 
            throw new TranslationFailException({ 
                message: e.message,
                status: e.response?.promptFeedback.blockReason ?? 'BLOCKED'
            })
        }))?.response?.text()


        let result = (await parseResponse(response, texts.length))
        //.filter(text => text !== "string")
        if (result.length !== texts.length || !(result instanceof Array)) { 
            const message = result.length === 0? 
				"Failed to parse JSON."
				: `Unexpected error: length ${result.length} out of ${texts.length}.` + '\n\n' + response;
            throw new TranslationFailException({
                message,
                status: 200
            }) 

        } //else if (result.length > texts.length) { result = result.slice(0, texts.length) }

        return result
    }

    protected async execute(texts: string[]) { 
        if (this.api_type==="free" && this.model_name.includes("pro")) { 
            alert("you are using a pro model with a free key! The rate limit is way lower (100 requests per day).")
            //return this.abort()
        }

        if (this.api_type === "free") { 
            return this.executeWithRateLimit(texts, { 
                requests: 10,
                seconds: 60
            }) 

        } else { return this.buildTranslationResult(texts) }
    }


}


const GeminiModule = { EngineClient }
export type IGeminiModule = typeof GeminiModule
module.exports = GeminiModule