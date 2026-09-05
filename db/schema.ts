import {
  sqliteTable,
  text,
  integer,
  index,
  uniqueIndex,
  primaryKey,
} from 'drizzle-orm/sqlite-core';
export const camps = sqliteTable('camps', {
  code: text('code').primaryKey(),
  state: text('state').notNull(),
  revision: integer('revision').notNull().default(0),
  mutation: text('mutation'),
  created: integer('created').notNull(),
  updated: integer('updated').notNull(),
});
export const campers = sqliteTable(
  'campers',
  {
    token: text('token').primaryKey(),
    id: text('id').notNull(),
    room: text('room')
      .notNull()
      .references(() => camps.code, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    pose: text('pose').notNull(),
    seen: integer('seen').notNull(),
    needs: text('needs').notNull().default(''),
    lastHurt: integer('last_hurt').notNull().default(0),
    fishing: text('fishing').notNull().default('null'),
    lockId: text('lock_id'),
    lockUntil: integer('lock_until').notNull().default(0),
    lastAction: text('last_action'),
    lastResult: text('last_result'),
  },
  (t) => [
    index('campers_room_seen').on(t.room, t.seen),
    uniqueIndex('campers_id').on(t.id),
  ],
);
export const campActions = sqliteTable(
  'camp_actions',
  {
    token: text('token')
      .notNull()
      .references(() => campers.token, { onDelete: 'cascade' }),
    requestId: text('request_id').notNull(),
    command: text('command').notNull(),
    result: text('result').notNull(),
  },
  (t) => [primaryKey({ columns: [t.token, t.requestId] })],
);
