import type {
	IAuthenticateGeneric,
	Icon,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class AstrowayApi implements ICredentialType {
	name = 'astrowayApi';

	displayName = 'AstroWay API';

	icon: Icon = { light: 'file:astroway.svg', dark: 'file:astroway.dark.svg' };

	documentationUrl = 'https://api.astroway.info/en/authentication/';

	properties: INodeProperties[] = [
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			required: true,
			placeholder: 'aw_live_...',
			description: 'Create a key in the AstroWay dashboard at https://api.astroway.info/dashboard/keys',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				'X-Api-Key': '={{$credentials.apiKey}}',
			},
		},
	};

	// Reads the key's own status; it spends no credits.
	test: ICredentialTestRequest = {
		request: {
			baseURL: 'https://api.astroway.info/v1',
			url: '/auth/keys/me',
			method: 'GET',
		},
	};
}
