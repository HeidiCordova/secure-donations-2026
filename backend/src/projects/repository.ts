import type { AuditEvent } from '../audit/audit.js';
import type { Project } from '../shared/schemas.js';

/**
 * Acceso a datos de proyectos. Las escrituras exitosas reciben su AuditEvent para guardarlo
 * en la misma transacción (CA-08.3): no puede existir una creación o publicación sin evento.
 */
export interface ProjectRepository {
  /** Proyectos en estado PUBLICADO, más recientes primero. */
  listPublished(): Promise<Project[]>;
  get(projectId: string): Promise<Project | undefined>;
  /** Crea el proyecto; falla con CONFLICT si el projectId ya existe. */
  create(project: Project, audit: AuditEvent): Promise<void>;
  /**
   * Pasa de BORRADOR a PUBLICADO con escritura condicionada.
   * Lanza NOT_FOUND si no existe y CONFLICT si ya no está en BORRADOR (incluida una carrera).
   */
  publish(projectId: string, updatedAt: string, audit: AuditEvent): Promise<Project>;
}
