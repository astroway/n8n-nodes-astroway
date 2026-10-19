import type {
	IDataObject,
	IExecuteFunctions,
	IHttpRequestMethods,
	ILoadOptionsFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	JsonObject,
	ResourceMapperFields,
	ResourceMapperValue,
} from 'n8n-workflow';
import { NodeApiError, NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';
import { operationFields, QUERY_PREFIX, SPEC_URL } from './fields';
import { operationProperties, resourceProperty, ROUTES } from './operations.generated';

const BASE_URL = 'https://api.astroway.info/v1';

// The spec is about 2.5 MB; one copy per process is enough for the field forms.
let specCache: { at: number; spec: Parameters<typeof operationFields>[0] } | null = null;
const SPEC_TTL_MS = 30 * 60 * 1000;

function toValue(raw: unknown, type: string | undefined): unknown {
	if (raw === null || raw === undefined || raw === '') return undefined;
	if ((type === 'object' || type === 'array') && typeof raw === 'string') {
		try {
			return JSON.parse(raw);
		} catch {
			return raw;
		}
	}
	if (type === 'number' && typeof raw === 'string') {
		const n = Number(raw);
		return Number.isNaN(n) ? raw : n;
	}
	if (type === 'boolean' && typeof raw === 'string') return raw === 'true';
	return raw;
}

/** The API's own `{ error: { code, message } }`, wherever the HTTP helper put the body. */
function apiError(error: unknown): { code: string; message: string } | undefined {
	const e = error as { response?: { body?: unknown; data?: unknown }; cause?: { response?: { data?: unknown } } };
	for (const raw of [e?.response?.body, e?.response?.data, e?.cause?.response?.data]) {
		const body = typeof raw === 'string' ? safeJson(raw) : raw;
		const inner = (body as { error?: { code?: unknown; message?: unknown } } | undefined)?.error;
		if (inner && typeof inner.code === 'string') return { code: inner.code, message: String(inner.message ?? '') };
	}
	return undefined;
}

function safeJson(text: string): unknown {
	try {
		return JSON.parse(text);
	} catch {
		return undefined;
	}
}

export class Astroway implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'AstroWay',
		name: 'astroway',
		icon: { light: 'file:astroway.svg', dark: 'file:astroway.dark.svg' },
		group: ['transform'],
		version: [1],
		subtitle: '={{$parameter["operation"]}}',
		description:
			'Astrology calculations: natal charts, synastry, transits, Vedic, Human Design, BaZi, numerology, tarot and more',
		defaults: { name: 'AstroWay' },
		usableAsTool: true,
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		credentials: [{ name: 'astrowayApi', required: true }],
		properties: [
			resourceProperty,
			...operationProperties,
			{
				displayName: 'Fields',
				name: 'fields',
				type: 'resourceMapper',
				noDataExpression: true,
				default: { mappingMode: 'defineBelow', value: null },
				required: true,
				typeOptions: {
					loadOptionsDependsOn: ['resource', 'operation'],
					resourceMapper: {
						resourceMapperMethod: 'getOperationFields',
						mode: 'add',
						addAllFields: false,
						supportAutoMap: false,
						fieldWords: { singular: 'field', plural: 'fields' },
					},
				},
			},
		],
	};

	methods = {
		resourceMapping: {
			async getOperationFields(this: ILoadOptionsFunctions): Promise<ResourceMapperFields> {
				const value = this.getNodeParameter('operation', '') as string;
				const op = ROUTES[value];
				if (!op) return { fields: [], emptyFieldsNotice: 'Pick an operation first' };
				if (!specCache || Date.now() - specCache.at > SPEC_TTL_MS) {
					const spec = await this.helpers.httpRequest({ method: 'GET', url: SPEC_URL, json: true });
					specCache = { at: Date.now(), spec };
				}
				const fields = operationFields(specCache.spec, op);
				return { fields, emptyFieldsNotice: 'This operation takes no fields' };
			},
		},
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const out: INodeExecutionData[] = [];

		for (let i = 0; i < items.length; i++) {
			try {
				const value = this.getNodeParameter('operation', i) as string;
				const op = ROUTES[value];
				if (!op) {
					throw new NodeOperationError(this.getNode(), `Unknown operation "${value}"`, { itemIndex: i });
				}
				const mapper = this.getNodeParameter('fields', i, null) as ResourceMapperValue | null;
				const types = new Map((mapper?.schema ?? []).map((f) => [f.id, f.type]));

				let path = op.path;
				const qs: IDataObject = {};
				const body: IDataObject = {};
				for (const [id, raw] of Object.entries(mapper?.value ?? {})) {
					const v = toValue(raw, types.get(id));
					if (v === undefined) continue;
					if (id.startsWith(QUERY_PREFIX)) qs[id.slice(QUERY_PREFIX.length)] = v as IDataObject[string];
					else if (op.pathParams.includes(id)) path = path.replace(`{${id}}`, encodeURIComponent(String(v)));
					else if (op.query.includes(id)) qs[id] = v as IDataObject[string];
					else body[id] = v as IDataObject[string];
				}
				const missing = path.match(/\{([^}]+)\}/);
				if (missing) {
					throw new NodeOperationError(this.getNode(), `Field "${missing[1]}" is required`, { itemIndex: i });
				}

				const response = (await this.helpers.httpRequestWithAuthentication.call(this, 'astrowayApi', {
					method: op.method as IHttpRequestMethods,
					url: `${BASE_URL}${path}`,
					qs,
					body: op.hasBody ? body : undefined,
					json: true,
				})) as IDataObject;

				// The API wraps every answer as { ok, data }; downstream nodes want the data.
				const data = response?.ok === true && response.data !== undefined ? response.data : response;
				const json = Array.isArray(data) ? { items: data } : (data as IDataObject);
				out.push({ json, pairedItem: { item: i } });
			} catch (error) {
				const api = apiError(error);
				if (this.continueOnFail()) {
					const json = api ? { error: api.message, code: api.code } : { error: (error as Error).message };
					out.push({ json, pairedItem: { item: i } });
					continue;
				}
				if (error instanceof NodeOperationError) throw new NodeOperationError(this.getNode(), error, { itemIndex: i });
				throw new NodeApiError(this.getNode(), error as JsonObject, {
					itemIndex: i,
					...(api ? { message: `${api.code}: ${api.message}`, description: `AstroWay API error ${api.code}` } : {}),
				});
			}
		}
		return [out];
	}
}
