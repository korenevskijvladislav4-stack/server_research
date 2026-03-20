-- Выполните в MySQL, если чат падает с ошибкой "column reasoning does not exist"
-- (или используйте: cd server && npx prisma db push)

ALTER TABLE `chat_messages`
  ADD COLUMN `reasoning` TEXT NULL AFTER `content`;

ALTER TABLE `chat_messages`
  ADD COLUMN `model_id` VARCHAR(255) NULL AFTER `reasoning`;
