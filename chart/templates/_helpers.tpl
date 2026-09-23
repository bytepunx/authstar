{{/* Chart-scoped resource name prefix, used only by the hook's own ConfigMap/Secret/Job (the 8 services' own resources are named literally, matching bytepunx/deploy). */}}
{{- define "authstar-chart.fullname" -}}
{{- .Release.Name | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "authstar-chart.labels" -}}
app.kubernetes.io/name: authstar-chart
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end -}}

{{/*
Shared template snippets used by every service's Deployment. Kept small and
literal rather than one large parameterized "generic Deployment" macro, so
each templates/<service>/deployment.yaml stays a readable, side-by-side
mirror of that service's real manifest in bytepunx/deploy.
*/}}

{{/* Standard labels for a given service name (passed as the string "." ). */}}
{{- define "authstar.labels" -}}
app: {{ . }}
{{- end -}}

{{/* imagePullSecrets block, chart-wide. */}}
{{- define "authstar.imagePullSecrets" -}}
imagePullSecrets:
  - name: {{ .Values.imagePullSecretName }}
{{- end -}}

{{/*
TCP liveness/readiness probes, matching every live authstar-platform
Deployment (no service has a dedicated health route yet).
Usage: {{ include "authstar.probes" .Values.<service>.port }}
*/}}
{{- define "authstar.probes" -}}
livenessProbe:
  tcpSocket:
    port: {{ . }}
  initialDelaySeconds: 5
  periodSeconds: 10
  failureThreshold: 3
readinessProbe:
  tcpSocket:
    port: {{ . }}
  initialDelaySeconds: 5
  periodSeconds: 5
  failureThreshold: 3
{{- end -}}

{{/*
Resource requests/limits block.
Usage: {{ include "authstar.resources" .Values.<service>.resources }}
*/}}
{{- define "authstar.resources" -}}
resources:
{{ toYaml . | indent 2 }}
{{- end -}}

{{/*
extraEnv passthrough -- a raw list of {name, value} / {name, valueFrom}
entries merged verbatim, not specially templated (Story 001, Provisioning
hook section).
Usage: {{ include "authstar.extraEnv" .Values.<service>.extraEnv }}
(emits nothing if the list is empty, so it's always safe to append into an
existing `env:` list via nindent)
*/}}
{{- define "authstar.extraEnv" -}}
{{- if . }}
{{ toYaml . }}
{{- end -}}
{{- end -}}

{{/* SPIFFE CSI volume mount, for the services that dial signet directly. */}}
{{- define "authstar.spiffeVolumeMount" -}}
- name: spiffe
  mountPath: /run/spire/sockets
  readOnly: true
{{- end -}}

{{/* SPIFFE CSI volume, for the services that dial signet directly. */}}
{{- define "authstar.spiffeVolume" -}}
- name: spiffe
  csi:
    driver: csi.spiffe.io
    readOnly: true
{{- end -}}
