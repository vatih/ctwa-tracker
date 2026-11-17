// CTWA Tracker WhatsApp Engine: satu proses Go untuk semua sesi WhatsApp.
package main

import (
	"context"
	"database/sql"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"strings"
	"syscall"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	_ "github.com/jackc/pgx/v5/stdlib"
	"go.mau.fi/whatsmeow/store/sqlstore"

	"ctwa-tracker/engine/internal/httpapi"
	"ctwa-tracker/engine/internal/session"
	"ctwa-tracker/engine/internal/walog"
	"ctwa-tracker/engine/internal/writer"
)

func main() {
	level := slog.LevelInfo
	if os.Getenv("LOG_LEVEL") == "debug" {
		level = slog.LevelDebug
	}
	log := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: level}))
	if err := run(log); err != nil {
		log.Error("engine stopped", "err", err)
		os.Exit(1)
	}
}

// loadSecretsFile mengisi env yang kosong dari file KEY=VALUE (dibuat service `secrets` di compose Dokploy).
func loadSecretsFile(path string) {
	if path == "" {
		return
	}
	data, err := os.ReadFile(path)
	if err != nil {
		return
	}
	for _, line := range strings.Split(string(data), "\n") {
		k, v, ok := strings.Cut(strings.TrimSpace(line), "=")
		if ok && k != "" && os.Getenv(k) == "" {
			_ = os.Setenv(k, strings.TrimSpace(v))
		}
	}
}

func run(log *slog.Logger) error {
	loadSecretsFile(os.Getenv("SECRETS_FILE"))
	dsn := mustEnv("DATABASE_URL")
	token := mustEnv("INTERNAL_TOKEN")
	addr := envOr("ENGINE_ADDR", ":8080")
	poolSize := envInt("DB_POOL_SIZE", 4)

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	// Pool untuk data aplikasi (leads/messages/status)
	pcfg, err := pgxpool.ParseConfig(dsn)
	if err != nil {
		return err
	}
	pcfg.MaxConns = int32(poolSize)
	pool, err := pgxpool.NewWithConfig(ctx, pcfg)
	if err != nil {
		return err
	}
	defer pool.Close()

	// Store whatsmeow (tabel whatsmeow_*) di database yang sama, pool kecil
	sqlDB, err := sql.Open("pgx", dsn)
	if err != nil {
		return err
	}
	sqlDB.SetMaxOpenConns(poolSize)
	sqlDB.SetMaxIdleConns(2)
	sqlDB.SetConnMaxIdleTime(5 * time.Minute)
	waLogger := walog.New(log.With("component", "whatsmeow"), slog.LevelWarn)
	container := sqlstore.NewWithDB(sqlDB, "postgres", waLogger.Sub("store"))
	if err := container.Upgrade(ctx); err != nil {
		return err
	}

	w := writer.New(writer.DefaultConfig(), writer.PGFlush(pool), log.With("component", "writer"))
	writerCtx, cancelWriter := context.WithCancel(context.Background())
	defer cancelWriter()
	go w.Run(writerCtx)

	mgr := session.NewManager(container, pool, w, log.With("component", "session"), waLogger)
	go func() {
		// Saat cold start, tabel aplikasi bisa belum ada karena migrasi dijalankan
		// container app; coba ulang sampai DB siap.
		for attempt := 1; ; attempt++ {
			err := mgr.Start(ctx)
			if err == nil || ctx.Err() != nil {
				return
			}
			wait := min(time.Duration(attempt)*5*time.Second, time.Minute)
			log.Warn("restore sessions failed, retrying", "attempt", attempt, "in", wait, "err", err)
			select {
			case <-ctx.Done():
				return
			case <-time.After(wait):
			}
		}
	}()

	srv := &http.Server{
		Addr:              addr,
		Handler:           httpapi.New(mgr, w, token),
		ReadHeaderTimeout: 10 * time.Second,
	}
	go func() {
		log.Info("engine listening", "addr", addr)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Error("http server", "err", err)
			stop()
		}
	}()

	<-ctx.Done()
	log.Info("shutting down")
	shutCtx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	_ = srv.Shutdown(shutCtx)
	mgr.Shutdown()
	w.Close() // flush sisa pesan sebelum keluar
	return nil
}

func mustEnv(k string) string {
	v := os.Getenv(k)
	if v == "" {
		slog.Error("missing env", "key", k)
		os.Exit(1)
	}
	return v
}

func envOr(k, def string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return def
}

func envInt(k string, def int) int {
	if v, err := strconv.Atoi(os.Getenv(k)); err == nil && v > 0 {
		return v
	}
	return def
}
