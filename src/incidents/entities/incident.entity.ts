import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  type Relation,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { IncidentHistory } from './incident-history.entity';
import {
  IncidentCategory,
  IncidentPriority,
  IncidentStatus,
} from '../../common/enums/incident.enums';

@Entity({
  name: 'incidents',
})
export class Incident {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 120 })
  title: string;

  @Column({ type: 'enum', enum: IncidentCategory })
  category: IncidentCategory;

  @Column({ type: 'text' })
  description: string;

  @Column({ type: 'varchar', length: 300 })
  address: string;

  @Column({ type: 'double precision', nullable: true })
  latitude: number | null;

  @Column({ type: 'double precision', nullable: true })
  longitude: number | null;

  @Column({
    type: 'varchar',
    length: 25,
    name: 'contact_phone',
    nullable: true,
  })
  contactPhone: string | null;

  @Column({
    type: 'enum',
    enum: IncidentPriority,
    default: IncidentPriority.MEDIUM,
  })
  priority: IncidentPriority;

  @Column({ type: 'enum', enum: IncidentStatus, default: IncidentStatus.NEW })
  status: IncidentStatus;

  @CreateDateColumn({
    type: 'timestamptz',
    default: () => 'CURRENT_TIMESTAMP',
    name: 'created_at',
  })
  createdAt: Date;

  @UpdateDateColumn({
    type: 'timestamptz',
    default: () => 'CURRENT_TIMESTAMP',
    name: 'updated_at',
  })
  updatedAt: Date;

  // Ciudadano que creó el reporte (ManyToOne)
  @Column({ type: 'uuid', name: 'created_by' })
  createdById: string;

  @ManyToOne(() => User, (user) => user.reportedIncidents, { nullable: false })
  @JoinColumn({ name: 'created_by' })
  createdBy: Relation<User>;

  // Operador responsable del reporte (ManyToOne, opcional)
  @Column({ type: 'uuid', name: 'assigned_to', nullable: true })
  assignedToId: string | null;

  @ManyToOne(() => User, (user) => user.assignedIncidents, { nullable: true })
  @JoinColumn({ name: 'assigned_to' })
  assignedTo: Relation<User> | null;

  @OneToMany(() => IncidentHistory, (entry) => entry.incident)
  history: Relation<IncidentHistory[]>;
}
