{
	"id":   "shipment-tracker-ysci",
	"lang": "typescript",
	"build": {
		"docker": {
			"bundle_source": true,
			"working_dir":   "/workspace"
		},
		"hooks": {
			"prebuild": "cd /workspace && pnpm install"
		}
	},
	"global_cors": {
		"allow_origins_with_credentials": [
			"https://shipment-tracker-web.vercel.app",
			"https://*.vercel.app"
		]
	}
}
