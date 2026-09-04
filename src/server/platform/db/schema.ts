// Registry of every table. drizzle-kit reads this file to generate migrations, and
// the db client uses it for types. A new feature adds one export line here.

export { users } from '../auth/table';
