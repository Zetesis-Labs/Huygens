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
Image reference for the MCP.
*/}}
{{- define "huygens.mcp.image" -}}
{{- $tag := default .Chart.AppVersion .Values.mcp.image.tag -}}
{{ .Values.image.registry }}/{{ .Values.image.repository }}/{{ .Values.mcp.image.name }}:{{ $tag }}
{{- end -}}

{{/*
Image reference for the Worker.
*/}}
{{- define "huygens.worker.image" -}}
{{- $tag := default .Chart.AppVersion .Values.worker.image.tag -}}
{{ .Values.image.registry }}/{{ .Values.image.repository }}/{{ .Values.worker.image.name }}:{{ $tag }}
{{- end -}}
