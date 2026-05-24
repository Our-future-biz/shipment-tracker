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
	}
}
