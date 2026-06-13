package middleware

import (
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
)

type responseHeaderPolicyWriter struct {
	gin.ResponseWriter
	applied bool
}

func ResponseHeaderPolicy() gin.HandlerFunc {
	return func(c *gin.Context) {
		if c != nil && c.Writer != nil {
			c.Writer = &responseHeaderPolicyWriter{ResponseWriter: c.Writer}
		}
		c.Next()
	}
}

func (w *responseHeaderPolicyWriter) applyPolicy() {
	if w.applied {
		return
	}
	w.applied = true
	service.ApplyGlobalResponseHeaderPolicyToHeader(w.Header())
}

func (w *responseHeaderPolicyWriter) WriteHeader(statusCode int) {
	w.applyPolicy()
	w.ResponseWriter.WriteHeader(statusCode)
}

func (w *responseHeaderPolicyWriter) WriteHeaderNow() {
	w.applyPolicy()
	w.ResponseWriter.WriteHeaderNow()
}

func (w *responseHeaderPolicyWriter) Write(data []byte) (int, error) {
	w.applyPolicy()
	return w.ResponseWriter.Write(data)
}

func (w *responseHeaderPolicyWriter) WriteString(data string) (int, error) {
	w.applyPolicy()
	return w.ResponseWriter.WriteString(data)
}

func (w *responseHeaderPolicyWriter) Flush() {
	w.applyPolicy()
	w.ResponseWriter.Flush()
}
