package httpapi

import "net/http"

func (s *Server) sameOrigin(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		if origin != "" {
			allowed := false
			for _, value := range s.config.AllowedOrigins {
				if value == origin {
					allowed = true
					break
				}
			}
			if !allowed {
				writeError(w, 403, "origin not allowed")
				return
			}
		}
		next(w, r)
	}
}
