import {
  sqliteTable,
  text,
  integer,
  index,
  uniqueIndex,
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
    lastAction: text('last_action'),
    lastResult: text('last_result'),
  },
  (t) => [
    index('campers_room_seen').on(t.room, t.seen),
    uniqueIndex('campers_id').on(t.id),
  ],
);
