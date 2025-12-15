# Security Policy

## Security Improvements

This MCP server has been audited and enhanced with the following security measures:

### Input Validation

1. **Path Traversal Prevention**: All file paths are validated to prevent directory traversal attacks (e.g., `../../../etc/passwd`)
2. **Owner/Repo Name Validation**: Repository owners and names are validated to contain only safe characters (alphanumeric, dash, underscore, dot)
3. **Git Reference Validation**: Branch names and commit SHAs are validated to prevent injection attacks
4. **URL Encoding**: All user inputs are properly URL-encoded before being used in API requests
5. **Length Limits**: Title and body fields have appropriate length limits to prevent DoS attacks

### Authentication & Configuration

1. **Environment Variable Validation**: Required environment variables (FORGEJO_BASE_URL, FORGEJO_TOKEN) are validated at startup
2. **URL Protocol Validation**: Only HTTP and HTTPS protocols are allowed for the Forgejo base URL
3. **Token Sanitization**: API tokens are trimmed of whitespace to prevent common configuration errors

### Error Handling

1. **Secure Error Messages**: Error messages don't expose sensitive information like internal paths or stack traces
2. **User-Friendly Errors**: HTTP status codes are mapped to user-friendly error messages
3. **Network Error Handling**: Proper error handling for network failures and timeouts

### API Security

1. **Content Size Limits**: File content responses are limited to 1MB to prevent memory exhaustion
2. **Base64 Decoding Safety**: File content decoding includes proper error handling
3. **State Parameter Validation**: Issue state parameters are validated against allowed values

## Reporting a Vulnerability

If you discover a security vulnerability in this project, please report it by:

1. **DO NOT** open a public issue
2. Contact the maintainers privately through GitHub Security Advisories
3. Provide detailed information about the vulnerability, including:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Suggested fix (if any)

## Security Best Practices for Users

### Token Management

1. **Never commit tokens**: Keep your FORGEJO_TOKEN in environment variables, never in code
2. **Use read-only tokens**: If you only need read access, create a token with minimal permissions
3. **Rotate tokens regularly**: Change your API tokens periodically
4. **Use separate tokens**: Don't reuse tokens across different applications

### Configuration

1. **Use HTTPS**: Always use HTTPS for your FORGEJO_BASE_URL in production
2. **Validate your Forgejo instance**: Ensure your Forgejo instance is properly secured and up-to-date
3. **Network isolation**: Run this MCP server in a secure network environment
4. **Monitor usage**: Keep track of API calls and watch for unusual patterns

### Environment Setup

```bash
# Good: Using environment variables
export FORGEJO_BASE_URL="https://your-forgejo.com"
export FORGEJO_TOKEN="your_secure_token_here"

# Bad: Don't do this
FORGEJO_TOKEN="token_in_shell_history"  # This ends up in shell history
```

## Known Limitations

1. **Rate Limiting**: This server does not implement client-side rate limiting. Ensure your Forgejo instance has proper rate limiting configured.
2. **Large Files**: Files larger than 1MB are truncated in responses to prevent memory issues.
3. **Binary Files**: Binary file content may not display correctly as it's decoded as UTF-8.

## Audit History

- **2025-12-15**: Initial security audit completed
  - Added input validation for all user inputs
  - Implemented path traversal protection
  - Enhanced error handling to prevent information disclosure
  - Added environment variable validation
  - Implemented URL encoding for all API parameters
