-- CreateTable
CREATE TABLE "profiles" (
    "id" UUID NOT NULL,
    "nickname" TEXT NOT NULL,
    "avatar" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "room_sessions" (
    "id" TEXT NOT NULL,
    "ruleset_id" TEXT NOT NULL,
    "session_format" TEXT NOT NULL,
    "result" JSONB NOT NULL,
    "finished_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "room_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "game_logs" (
    "id" UUID NOT NULL,
    "room_id" TEXT NOT NULL,
    "game_number" INTEGER NOT NULL,
    "ruleset_id" TEXT NOT NULL,
    "seat_user_ids" JSONB NOT NULL,
    "events" JSONB NOT NULL,
    "final_state" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "game_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "game_logs_room_id_game_number_key" ON "game_logs"("room_id", "game_number");
