# Contributing to AI in Action Bot

Thank you for your interest in contributing to the AI in Action Bot! This Discord bot helps facilitate scheduling and AI-driven interactions within the AI in Action community. We welcome contributions of all types.

## Table of Contents

- [Getting Started](#getting-started)
- [Development Workflow](#development-workflow)
- [Code Standards](#code-standards)
- [Testing](#testing)
- [Documentation](#documentation)
- [Pull Request Process](#pull-request-process)
- [Issue Reporting](#issue-reporting)
- [Community Guidelines](#community-guidelines)

## Getting Started

### Prerequisites

Before contributing, ensure you have:

- Node.js (v18+ recommended) and npm
- MongoDB instance (local or remote)
- Discord Bot Token (for testing)
- OpenRouter API Key (for LLM features)
- Git for version control

### Setting Up Your Development Environment

1. **Fork and Clone the Repository**
   ```bash
   git clone https://github.com/your-username/ai-in-action-bot.git
   cd ai-in-action-bot
   ```

2. **Install Dependencies**
   ```bash
   npm install
   ```

3. **Environment Configuration**
   
   Create a `.env` file in the root directory:
   ```dotenv
   MONGODB_URI=mongodb://localhost:27017/aiia-bot-dev
   DISCORD_TOKEN=your_discord_bot_token
   OPENROUTER_API_KEY=your_openrouter_api_key
   DISCORD_CLIENT_ID=your_discord_client_id
   DISCORD_GUILD_ID=your_discord_guild_id
   ZOOM_LINK=https://zoom.us/j/yourmeetingid
   ZOOM_PASSWORD=yourpassword
   NODE_ENV=development
   ```

4. **Deploy Discord Commands**
   ```bash
   npm run deploy-commands
   ```

5. **Start the Development Server**
   ```bash
   npm run dev
   ```

### Project Structure Overview

- `lib/discord/` - Discord bot logic and commands
- `lib/llm/` - LLM integration (OpenRouter)
- `lib/mongo/` - Database connection and utilities
- `models/` - Mongoose schemas
- `test/` - Automated tests
- `docs/` - Project documentation and tutorials
- `api/` - Express API routes
- `middleware/` - Express middleware

## Development Workflow

### Branching Strategy

1. Create a feature branch from `main`:
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. Make your changes and commit frequently with clear messages
3. Push to your fork and create a pull request

### Commit Messages

Use clear, descriptive commit messages:

```
feat: add cancel talk command
fix: handle undefined user in scheduling logic
docs: update API documentation
test: add tests for scheduling edge cases
refactor: simplify Discord command structure
```

## Code Standards

### JavaScript Style

We use Prettier and ESLint for code formatting:

```bash
# Format and lint your code
npm run lint
```

**Style Guidelines:**
- Use single quotes for strings
- No semicolons (configured in prettier)
- 2-space indentation
- Meaningful variable and function names
- Add comments for complex logic

### File Organization

- Keep files focused on a single responsibility
- Use clear, descriptive file names
- Group related functionality in appropriate directories
- Follow existing patterns in the codebase

### Error Handling

- Use try-catch blocks for async operations
- Provide meaningful error messages
- Log errors appropriately
- Fail gracefully when possible

## Testing

### Running Tests

```bash
# Run all tests
npm test

# Run specific test file
npm test schedulingLogic.test.js
```

### Writing Tests

- Use the `tape` testing framework
- Write tests for new features and bug fixes
- Follow existing test patterns
- Test both happy path and error cases
- Mock external dependencies (MongoDB, Discord API, LLM calls)

**Test File Structure:**
```javascript
const test = require('tape')
const { setupTestDB, cleanupTestDB } = require('./helpers/cleanup')

test('setup', async (t) => {
  await setupTestDB()
  t.end()
})

test('your feature works correctly', async (t) => {
  // Your test code here
  t.end()
})

test('cleanup', async (t) => {
  await cleanupTestDB()
  t.end()
})
```

### Test Coverage

- Aim for good test coverage of new code
- Focus on testing core business logic
- Include integration tests for Discord commands
- Test database operations and LLM interactions

## Documentation

### Code Documentation

- Add JSDoc comments for public functions
- Document complex algorithms or business logic
- Update README.md if you change setup/usage instructions

### Tutorial Documentation

If your contribution adds new features:

1. Add tutorial documentation in `docs/tutorials/`
2. Follow the existing numbering scheme
3. Include step-by-step examples
4. Add screenshots for Discord interactions where helpful

### API Documentation

- Document new API endpoints in appropriate files
- Include request/response examples
- Document error conditions

## Pull Request Process

### Before Submitting

1. **Run Tests**: Ensure all tests pass
   ```bash
   npm test
   ```

2. **Lint Code**: Format your code
   ```bash
   npm run lint
   ```

3. **Update Documentation**: Add or update relevant documentation

4. **Test Locally**: Verify your changes work as expected

### Pull Request Template

When creating a PR, please include:

- **Description**: What does this PR do?
- **Changes**: List of specific changes made
- **Testing**: How was this tested?
- **Screenshots**: For UI/Discord interactions
- **Breaking Changes**: Any breaking changes?
- **Related Issues**: Link to related issues

### Review Process

- All PRs require at least one review
- Address reviewer feedback promptly
- Keep PRs focused and reasonably sized
- Be responsive to questions and suggestions

## Issue Reporting

### Bug Reports

When reporting bugs, include:

- **Environment**: OS, Node.js version, etc.
- **Steps to Reproduce**: Clear steps to reproduce the issue
- **Expected Behavior**: What should happen
- **Actual Behavior**: What actually happens
- **Error Messages**: Any error messages or logs
- **Screenshots**: If applicable

### Feature Requests

For new features:

- **Problem**: What problem does this solve?
- **Solution**: Proposed solution
- **Alternatives**: Other solutions considered
- **Additional Context**: Any other relevant information

### Using Issue Templates

- Use appropriate issue templates when available
- Provide as much detail as possible
- Search existing issues before creating new ones

## Community Guidelines

### Code of Conduct

- Be respectful and inclusive
- Focus on constructive feedback
- Help newcomers feel welcome
- Assume good intentions

### Communication

- Use clear, professional language
- Ask questions if you're unsure
- Share knowledge and help others
- Collaborate openly

### Getting Help

- Check existing documentation first
- Search closed issues and PRs
- Ask questions in issues or discussions
- Be patient when waiting for responses

## Development Tips

### Local Development

- Use `npm run dev` for auto-restarting during development
- Set `NODE_ENV=development` for detailed logging
- Use MongoDB compass or similar tools for database inspection
- Test Discord commands in a dedicated test server

### Debugging

- Use `console.log` for quick debugging (remove before committing)
- Use the Node.js debugger for complex issues
- Check Discord bot logs in the Discord Developer Portal
- Monitor MongoDB logs for database issues

### Performance

- Be mindful of API rate limits (Discord, OpenRouter)
- Use database indexes appropriately
- Cache responses when possible
- Consider memory usage for long-running processes

## Resources

- [Discord.js Documentation](https://discord.js.org/#/docs/main/stable/general/welcome)
- [MongoDB Documentation](https://docs.mongodb.com/)
- [Node.js Documentation](https://nodejs.org/en/docs/)
- [Project Documentation](./docs/)

## Questions?

If you have questions not covered in this guide:

1. Check the [project documentation](./docs/)
2. Search existing issues and discussions
3. Create a new issue with the "question" label
4. Join the AI in Action community discussions

Thank you for contributing to the AI in Action Bot! 🤖✨
