import { Type as IType } from '@google/genai'
import { ICustomEngineModule } from './custom'
import { IPromptModule } from './Prompt'
const {
    GoogleGenAI,
    HarmBlockThreshold,
    HarmCategory,
    ThinkingLevel,
    Type,
    GenerateContentResponsePromptFeedback,
    HarmBlockMethod,
} = require('@google/genai') as typeof import('@google/genai')
const { CustomEngine, TranslationFailException } = require("www/addons/gemini/Engine/custom.js") as ICustomEngineModule;
const { systemPrompt, userPrompt, parseResponse } = require("www/addons/gemini/Engine/Prompt.js") as IPromptModule;




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

function getResponseSchema(batchSize: number = 25) { 
    const responseSchema: { 
        type: IType.OBJECT
        properties: Record<string, any>
        required?: string[]
    } = { 
        type: Type.OBJECT,
        properties: {}
    }
    for (let i=0; i<batchSize; i++) { 
        responseSchema.properties[`${i}`] = { type: "string" }
    }
    responseSchema.required = Object.keys(responseSchema.properties)
    return responseSchema
}


class EngineClient extends CustomEngine { 
    get model_name(): string { return this.getEngine()?.getOptions('model_name') ?? "gemini-1.5-flash" }

    constructor(thisAddon: Addon) { 
        super({ 
            id: thisAddon.package.name,
            name: thisAddon.package.title,
            description: thisAddon.package.description,
            version: thisAddon.package.version,
            author: typeof thisAddon.package.author === 'object'? 
                thisAddon.package.author.name : thisAddon.package.author ?? '',
            maxRequestLength: 1100,
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
                        default: "gemini-3.0-flash-preview",
                        required: false,
                        enum: [
                            "gemini-1.5-flash", "gemini-1.5-flash-8b", 
                            "gemini-2.0-flash", "gemini-2.0-flash-lite", "gemini-2.0-flash-thinking", 
                            "gemini-2.5-flash", "gemini-2.5-flash-lite", 
                            "gemini-3-flash-preview", "gemini-3.1-flash-lite", 
                            "gemini-3.5-flash", "gemini-flash-latest", "gemini-flash-lite-latest", 

                            "gemini-1.0-pro", "gemini-1.5-pro", "gemini-1.5-pro-latest", 
                            "gemini-2.0-pro-exp-02-05", "gemini-2.0-pro", "gemini-2.5-pro", 
                            "gemini-3-pro", "gemini-3.1-pro-preview", "gemini-pro-latest", 
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
                    this.update(key, value && typeof value !== "object"? value : "")
                    if (this.api_type==="free" && this.model_name.includes("pro")) { 
                        alert("you are using a pro model with a free key! The rate limit is way lower")
                    }
                }
            }

        })
    }

    public async fetcher(texts: string[]) { 
        const ai = new GoogleGenAI({
            apiKey: this.api_key as string,
        });
        const contents = [
            {
                role: 'user',
                parts: [
                    {
                        text: userPrompt(texts),
                    },
                ],
            },
        ];

        const response = await ai.models.generateContent({
            model: this.model_name,
            config: {
                safetySettings,
                thinkingConfig: {
                    thinkingLevel: ThinkingLevel.HIGH,
                },
                temperature: 0,
                responseMimeType: "application/json",
                //responseJsonSchema: {},
                responseSchema: getResponseSchema(texts.length),
                systemInstruction: systemPrompt(this.target_language)
            },
            contents,
        })
        .then(async response => {
            if (!response.text) {
                throw new TranslationFailException({
                    message: await response.sdkHttpResponse?.responseInternal.text() as string,
                    status: response.sdkHttpResponse?.responseInternal.status
                })
            }

            return response.text
        })
        .catch((e) => { 
            throw new TranslationFailException({ 
                message: e.message, 
            })
        })


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
