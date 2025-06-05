/**
 * MOV Demuxer error handling
 */

export enum MOVErrorCode {
  INVALID_FILE_FORMAT = 'INVALID_FILE_FORMAT',
  UNSUPPORTED_CODEC = 'UNSUPPORTED_CODEC',
  CORRUPT_DATA = 'CORRUPT_DATA',
  WEBCODECS_NOT_SUPPORTED = 'WEBCODECS_NOT_SUPPORTED',
  DECODER_ERROR = 'DECODER_ERROR',
  SEEK_ERROR = 'SEEK_ERROR',
  SAMPLE_NOT_FOUND = 'SAMPLE_NOT_FOUND',
  STREAM_NOT_FOUND = 'STREAM_NOT_FOUND',
  INVALID_BOX_SIZE = 'INVALID_BOX_SIZE',
  MISSING_REQUIRED_BOX = 'MISSING_REQUIRED_BOX',
  INVALID_SAMPLE_TABLE = 'INVALID_SAMPLE_TABLE',
}

export class MOVError extends Error {
  public readonly code: MOVErrorCode
  public readonly details?: unknown

  constructor(code: MOVErrorCode, message: string, details?: unknown) {
    super(message)
    this.name = 'MOVError'
    this.code = code
    this.details = details
  }

  static invalidFileFormat(message = 'Invalid MOV/MP4 file format'): MOVError {
    return new MOVError(MOVErrorCode.INVALID_FILE_FORMAT, message)
  }

  static unsupportedCodec(codec: string): MOVError {
    return new MOVError(
      MOVErrorCode.UNSUPPORTED_CODEC,
      `Unsupported codec: ${codec}`,
      { codec },
    )
  }

  static corruptData(message = 'Corrupt or invalid data detected'): MOVError {
    return new MOVError(MOVErrorCode.CORRUPT_DATA, message)
  }

  static webCodecsNotSupported(): MOVError {
    return new MOVError(
      MOVErrorCode.WEBCODECS_NOT_SUPPORTED,
      'WebCodecs API is not supported in this environment',
    )
  }

  static decoderError(message: string, originalError?: Error): MOVError {
    return new MOVError(
      MOVErrorCode.DECODER_ERROR,
      `Decoder error: ${message}`,
      { originalError },
    )
  }

  static seekError(timestamp: number): MOVError {
    return new MOVError(
      MOVErrorCode.SEEK_ERROR,
      `Failed to seek to timestamp: ${timestamp}`,
      { timestamp },
    )
  }

  static sampleNotFound(index: number): MOVError {
    return new MOVError(
      MOVErrorCode.SAMPLE_NOT_FOUND,
      `Sample not found at index: ${index}`,
      { index },
    )
  }

  static streamNotFound(streamId: number): MOVError {
    return new MOVError(
      MOVErrorCode.STREAM_NOT_FOUND,
      `Stream not found: ${streamId}`,
      { streamId },
    )
  }

  static invalidBoxSize(type: string, size: number): MOVError {
    return new MOVError(
      MOVErrorCode.INVALID_BOX_SIZE,
      `Invalid box size for ${type}: ${size}`,
      { type, size },
    )
  }

  static missingRequiredBox(type: string): MOVError {
    return new MOVError(
      MOVErrorCode.MISSING_REQUIRED_BOX,
      `Missing required box: ${type}`,
      { type },
    )
  }

  static invalidSampleTable(reason: string): MOVError {
    return new MOVError(
      MOVErrorCode.INVALID_SAMPLE_TABLE,
      `Invalid sample table: ${reason}`,
      { reason },
    )
  }
}

/**
 * Error reporter for debugging
 */
export class ErrorReporter {
  private errors: MOVError[] = []
  private warnings: string[] = []
  private debug: boolean

  constructor(debug = false) {
    this.debug = debug
  }

  error(error: MOVError): void {
    this.errors.push(error)
    if (this.debug) {
      console.error(`[MOVError] ${error.code}: ${error.message}`, error.details)
    }
  }

  warn(message: string, details?: unknown): void {
    this.warnings.push(message)
    if (this.debug) {
      console.warn(`[MOVWarning] ${message}`, details)
    }
  }

  hasErrors(): boolean {
    return this.errors.length > 0
  }

  hasWarnings(): boolean {
    return this.warnings.length > 0
  }

  getErrors(): MOVError[] {
    return [...this.errors]
  }

  getWarnings(): string[] {
    return [...this.warnings]
  }

  clear(): void {
    this.errors = []
    this.warnings = []
  }

  report(): { errors: MOVError[]; warnings: string[] } {
    return {
      errors: this.getErrors(),
      warnings: this.getWarnings(),
    }
  }
}
