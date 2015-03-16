lint:
	@./node_modules/.bin/jshint lib/

test: lint
	@NODE_ENV=test ./node_modules/.bin/mocha --require chai --reporter Spec

.PHONY: lint test
