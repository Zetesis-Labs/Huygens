{{/*
Expand the name of the chart.
*/}}
{{- define "huygens.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{/*
Create a default fully qualified app name.
*/}}
{{- define "huygens.fullname" -}}
{{- if .Values.fullnameOverride -}}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- $name := default .Chart.Name .Values.nameOverride -}}
{{- if contains $name .Release.Name -}}
{{- .Release.Name | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- end -}}
{{- end -}}

{{/*
Per-component fully qualified names.
*/}}
{{- define "huygens.mcp.fullname" -}}{{ include "huygens.fullname" . }}-mcp{{- end -}}
{{- define "huygens.worker.fullname" -}}{{ include "huygens.fullname" . }}-worker{{- end -}}
{{- define "huygens.dashboard.fullname" -}}{{ include "huygens.fullname" . }}-dashboard{{- end -}}
{{- define "huygens.surrealdb.fullname" -}}{{ include "huygens.fullname" . }}-surrealdb{{- end -}}

{{/*
Common labels
*/}}
{{- define "huygens.labels" -}}
helm.sh/chart: {{ printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" }}
app.kubernetes.io/name: {{ include "huygens.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end -}}

{{/*
Selector labels for a sub-component.
Usage: {{ include "huygens.selectorLabels" (dict "ctx" . "component" "mcp") }}
*/}}
{{- define "huygens.selectorLabels" -}}
app.kubernetes.io/name: {{ include "huygens.name" .ctx }}
app.kubernetes.io/instance: {{ .ctx.Release.Name }}
app.kubernetes.io/component: {{ .component }}
{{- end -}}

{{/*
Image references.
*/}}
{{- define "huygens.mcp.image" -}}
{{- $tag := default .Chart.AppVersion .Values.mcp.image.tag -}}
{{ .Values.image.registry }}/{{ .Values.image.repository }}/{{ .Values.mcp.image.name }}:{{ $tag }}
{{- end -}}

{{- define "huygens.worker.image" -}}
{{- $tag := default .Chart.AppVersion .Values.worker.image.tag -}}
{{ .Values.image.registry }}/{{ .Values.image.repository }}/{{ .Values.worker.image.name }}:{{ $tag }}
{{- end -}}

{{- define "huygens.dashboard.image" -}}
{{- $tag := default .Chart.AppVersion .Values.dashboard.image.tag -}}
{{ .Values.image.registry }}/{{ .Values.image.repository }}/{{ .Values.dashboard.image.name }}:{{ $tag }}
{{- end -}}

{{/*
Image pull secrets block (renders nothing when empty).
*/}}
{{- define "huygens.imagePullSecrets" -}}
{{- with .Values.image.pullSecrets }}
imagePullSecrets:
{{- range . }}
  - name: {{ . }}
{{- end }}
{{- end }}
{{- end -}}

{{/*
Name of the Secret holding sensitive env (existing or chart-managed).
*/}}
{{- define "huygens.secretName" -}}
{{- if .Values.existingSecret -}}
{{- .Values.existingSecret -}}
{{- else -}}
{{- printf "%s-secret" (include "huygens.fullname" .) -}}
{{- end -}}
{{- end -}}

{{/*
ServiceAccount name.
*/}}
{{- define "huygens.serviceAccountName" -}}
{{- if .Values.serviceAccount.create -}}
{{- default (include "huygens.fullname" .) .Values.serviceAccount.name -}}
{{- else -}}
{{- default "default" .Values.serviceAccount.name -}}
{{- end -}}
{{- end -}}

{{/*
Effective SurrealDB websocket URL: the in-chart StatefulSet when enabled,
otherwise the externally provided env.surrealUrl.
*/}}
{{- define "huygens.surrealUrl" -}}
{{- if .Values.surrealdb.enabled -}}
ws://{{ include "huygens.surrealdb.fullname" . }}:8000/rpc
{{- else -}}
{{- required "env.surrealUrl is required when surrealdb.enabled=false" .Values.env.surrealUrl -}}
{{- end -}}
{{- end -}}
