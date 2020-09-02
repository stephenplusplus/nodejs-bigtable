// Copyright 2020 Google LLC
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     https://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import {PreciseDate} from '@google-cloud/precise-date';
import {promisifyAll} from '@google-cloud/promisify';
import snakeCase = require('lodash.snakecase');
import {google} from '../protos/protos';
import {Bigtable, Cluster, Table} from './';
import {BigtableTableAdminClient} from './v2';
import {CreateBackupConfig} from './cluster';
import {CallOptions, LROperation, ServiceError} from 'google-gax';

type IEmpty = google.protobuf.IEmpty;
export type IBackup = google.bigtable.admin.v2.IBackup;

export type BackupTimestamp = google.protobuf.ITimestamp | PreciseDate | Date;
export interface ModifiableBackupFields {
  /**
   * The ITimestamp (Date or PreciseDate will be converted) representing
   * when the backup will automatically be deleted. This must be at a
   * minimum 6 hours from the time of the backup request and a maximum of 30
   * days.
   */
  expireTime?: BackupTimestamp;
}

export interface GenericBackupCallback<T> {
  (err: ServiceError | null, backup: Backup, apiResponse?: T): void;
}

export type DeleteBackupCallback = GenericBackupCallback<IEmpty>;
export type DeleteBackupResponse = [Backup, IEmpty];

export type GetBackupCallback = GenericBackupCallback<IBackup>;
export type GetBackupResponse = [Backup, IBackup];

export type GetMetadataCallback = GenericBackupCallback<IBackup>;
export type GetMetadataResponse = [IBackup, IEmpty];

export type SetMetadataCallback = GenericBackupCallback<IBackup>;
export type SetMetadataResponse = [Backup, IBackup];

export type CreateBackupCallback = (
  err: ServiceError | null,
  backup?: Backup,
  operation?: LROperation<
    google.bigtable.admin.v2.IBackup,
    google.bigtable.admin.v2.ICreateBackupMetadata
  >,
  apiResponse?: google.bigtable.admin.v2.ICreateBackupMetadata
) => void;
export type CreateBackupResponse = [
  Backup,
  LROperation<
    google.bigtable.admin.v2.IBackup,
    google.bigtable.admin.v2.ICreateBackupMetadata
  >,
  google.bigtable.admin.v2.ICreateBackupMetadata
];

export type RestoreTableCallback = (
  err: ServiceError | null,
  table: Table | null,
  apiResponse?: LROperation<
    google.bigtable.admin.v2.ITable,
    google.bigtable.admin.v2.IRestoreTableMetadata
  >
) => void;
export type RestoreTableResponse = [
  Table,
  LROperation<
    google.bigtable.admin.v2.ITable,
    google.bigtable.admin.v2.IRestoreTableMetadata
  >
];

export interface GetBackupsOptions {
  /**
   * A filter expression that filters backups listed in the response.
   *   The expression must specify the field name, a comparison operator,
   *   and the value that you want to use for filtering. The value must be a
   *   string, a number, or a boolean. The comparison operator must be
   *   <, >, <=, >=, !=, =, or :. Colon ‘:’ represents a HAS operator which is
   *   roughly synonymous with equality. Filter rules are case insensitive.
   */
  filter?: string;

  /**
   * An expression for specifying the sort order of the results of the request.
   *   The string value should specify one or more fields in
   *   {@link google.bigtable.admin.v2.Backup|Backup}. The full syntax is
   *   described at https://aip.dev/132#ordering.
   */
  orderBy?: string;

  gaxOptions?: CallOptions;
}

export type GetBackupsResponse = [Backup[], IBackup[]];
export type GetBackupsCallback = (
  err: ServiceError | null,
  backups?: Backup[],
  apiResponse?: IBackup[]
) => void;

/**
 * Interact with backups like get detailed information from BigTable, create
 * a backup, or restore a backup to a table.
 *
 * @class
 * @param {Cluster} cluster The parent instance of this backup.
 * @param {string} name Name of the backup.
 *
 * @example
 * const {Bigtable} = require('@google-cloud/bigtable');
 * const bigtable = new Bigtable();
 * const instance = bigtable.instance('my-instance');
 * const cluster = instance.cluster('my-cluster');
 * const backup = cluster.backup('my-backup');
 */
export class Backup {
  bigtable: Bigtable;
  cluster: Cluster;

  /**
   * A unique backup string, e.g. "my-backup".
   */
  id: string;

  /**
   * The full path of the backup which is in the form of:
   *  `projects/{project}/instances/{instance}/clusters/{cluster}/backups/{backup}`.
   */
  name: string;
  metadata: IBackup;

  /**
   * @param {Cluster} cluster
   * @param {string} id The backup name or id.
   */
  constructor(cluster: Cluster, id: string) {
    this.bigtable = cluster.bigtable;
    this.cluster = cluster;
    this.metadata = {};

    const tableAdminClient = this.bigtable.api[
      'BigtableTableAdminClient'
    ] as BigtableTableAdminClient;

    if (id.includes('/')) {
      this.name = id;
      this.id = tableAdminClient.matchBackupFromBackupName(id).toString();
      if (!this.id) {
        throw new Error(`Backup id "${id}" is not formatted correctly.
        Please use the format "projects/{project}/instances/{instance}/clusters/{cluster}/backups/{backup}."`);
      }
    } else {
      this.id = id;
      this.name = tableAdminClient.backupPath(
        this.bigtable.projectId,
        this.cluster.instance.id,
        this.cluster.id,
        this.id
      );
    }
  }

  /**
   * A Date-compatible PreciseDate representation of `expireTime`.
   * @readonly
   * @return {PreciseDate}
   */
  get expireDate(): PreciseDate {
    if (!this.metadata || !this.metadata.expireTime) {
      throw new TypeError('An expireTime is required to convert to Date.');
    }
    return new PreciseDate({
      seconds: this.metadata.expireTime.seconds!,
      nanos: this.metadata.expireTime.nanos!,
    });
  }

  /**
   * A Date-compatible PreciseDate representation of `startTime`.
   * @readonly
   * @return {PreciseDate}
   */
  get startDate(): PreciseDate {
    if (!this.metadata || !this.metadata.startTime) {
      throw new TypeError('A startTime is required to convert to Date.');
    }
    return new PreciseDate({
      seconds: this.metadata.startTime.seconds!,
      nanos: this.metadata.startTime.nanos!,
    });
  }

  /**
   * A Date-compatible PreciseDate representation of `endTime`.
   * @readonly
   * @return {PreciseDate}
   */
  get endDate(): PreciseDate {
    if (!this.metadata || !this.metadata.endTime) {
      throw new TypeError('An endTime is required to convert to Date.');
    }
    return new PreciseDate({
      seconds: this.metadata.endTime.seconds!,
      nanos: this.metadata.endTime.nanos!,
    });
  }

  create(
    config: CreateBackupConfig
  ): Promise<CreateBackupResponse>;
  /**
   * Starts creating a new Cloud Bigtable Backup.
   *
   * The returned {@link google.longrunning.Operation|long-running operation}
   * can be used to track creation of the backup. Cancelling the returned
   * operation will stop the creation and delete the backup.
   *
   * @param {CreateBackupConfig} config Configuration object.
   * @param {string|Table} config.table Table to create the backup from.
   * @param {ModifiableBackupFields} config.metadata Metadata to set on the
   *     Backup.
   * @param {BackupTimestamp} config.metadata.expireTime When the backup will be
   *     automatically deleted.
   * @param {CallOptions} [config.gaxOptions] Request configuration options,
   *     outlined here:
   *     https://googleapis.github.io/gax-nodejs/CallSettings.html. 
   * @param {CallOptions | CreateBackupCallback} [gaxOptionsOrCallback]
   * @param {CreateBackupCallback} [cb]
   * @return {void | Promise<CreateBackupResponse>}
   */
  create(
    config: CreateBackupConfig,
    callback?: CreateBackupCallback
  ): void | Promise<CreateBackupResponse> {
    this.cluster.createBackup(this.id, config, callback!);
  }

  delete(gaxOptions?: CallOptions): Promise<DeleteBackupResponse>;
  delete(callback: DeleteBackupCallback): void;
  delete(gaxOptions: CallOptions, callback: DeleteBackupCallback): void;
  /**
   * Deletes this pending or completed Cloud Bigtable backup.
   *
   * @param {CallOptions | DeleteBackupCallback} [gaxOptionsOrCallback]
   * @param {DeleteBackupCallback} [cb]
   * @return {void | Promise<DeleteBackupResponse>}
   */
  delete(
    gaxOptionsOrCallback?: CallOptions | DeleteBackupCallback,
    cb?: DeleteBackupCallback
  ): void | Promise<DeleteBackupResponse> {
    const gaxOpts =
      typeof gaxOptionsOrCallback === 'object' ? gaxOptionsOrCallback : {};
    const callback =
      typeof gaxOptionsOrCallback === 'function' ? gaxOptionsOrCallback : cb!;

    this.bigtable.request<google.protobuf.IEmpty>(
      {
        client: 'BigtableTableAdminClient',
        method: 'deleteBackup',
        reqOpts: {
          name: this.name,
        },
        gaxOpts,
      },
      (err, resp) => callback(err, this, resp)
    );
  }

  get(gaxOptions?: CallOptions): Promise<GetBackupResponse>;
  get(callback: GetBackupCallback): void;
  get(gaxOptions: CallOptions, callback: GetBackupCallback): void;
  /**
   * Get a backup if it exists.
   *
   * @param {object} [gaxOptions] Request configuration options, outlined here:
   *     https://googleapis.github.io/gax-nodejs/CallSettings.html.
   * @param {function} callback The callback function.
   * @param {?error} callback.err An error returned while making this
   *     request.
   * @param {Backup} callback.backup The Backup instance.
   * @param {object} callback.apiResponse The full API response.
   */
  get(
    gaxOptionsOrCallback?: CallOptions | GetBackupCallback,
    cb?: GetBackupCallback
  ): void | Promise<GetBackupResponse> {
    const gaxOpts =
      typeof gaxOptionsOrCallback === 'object' ? gaxOptionsOrCallback : {};
    const callback =
      typeof gaxOptionsOrCallback === 'function' ? gaxOptionsOrCallback : cb!;

    this.bigtable.request<IBackup>(
      {
        client: 'BigtableTableAdminClient',
        method: 'getBackup',
        reqOpts: {
          name: this.name,
        },
        gaxOpts,
      },
      (err, resp) => {
        if (resp) {
          this.metadata = resp;
        }

        callback(err, this, this.metadata);
      }
    );
  }

  getMetadata(gaxOptions?: CallOptions): Promise<GetMetadataResponse>;
  getMetadata(callback: GetMetadataCallback): void;
  getMetadata(gaxOptions: CallOptions, callback: GetMetadataCallback): void;
  /**
   * Get a backup if it exists.
   *
   * @param {object} [gaxOptions] Request configuration options, outlined here:
   *     https://googleapis.github.io/gax-nodejs/CallSettings.html.
   * @param {function} callback The callback function.
   * @param {?error} callback.err An error returned while making this
   *     request.
   * @param {object} callback.apiResponse The full API response.
   */
  getMetadata(
    gaxOptionsOrCallback?: CallOptions | GetMetadataCallback,
    cb?: GetMetadataCallback
  ): void | Promise<GetMetadataResponse> {
    const gaxOpts =
      typeof gaxOptionsOrCallback === 'object' ? gaxOptionsOrCallback : {};
    const callback =
      typeof gaxOptionsOrCallback === 'function' ? gaxOptionsOrCallback : cb!;

    // @TODO `this.metadata` isn't a `Backup`. Figure out why it has to be cast.
    this.get(gaxOpts, err => callback(err, this.metadata as Backup));
  }

  restore(
    tableId: string,
    gaxOptions?: CallOptions
  ): Promise<RestoreTableResponse>;
  restore(
    tableId: string,
    gaxOptions: CallOptions,
    callback: RestoreTableCallback
  ): void;
  restore(tableId: string, callback: RestoreTableCallback): void;
  /**
   * Create a new table by restoring from this completed backup.
   *
   * The new table must be in the same instance as the instance containing
   * the backup. The returned
   * {@link google.longrunning.Operation|long-running operation} can be used
   * to track the progress of the operation, and to cancel it.
   *
   * @param {string} tableId The id of the table to create and restore to. This
   *   table must not already exist.
   * @param {CallOptions | RestoreTableCallback} [gaxOptionsOrCallback]
   * @param {RestoreTableCallback} [cb]
   * @return {void | Promise<RestoreTableResponse>}
   */
  restore(
    tableId: string,
    gaxOptionsOrCallback?: CallOptions | RestoreTableCallback,
    cb?: RestoreTableCallback
  ): void | Promise<RestoreTableResponse> {
    const gaxOpts =
      typeof gaxOptionsOrCallback === 'object' ? gaxOptionsOrCallback : {};
    const callback =
      typeof gaxOptionsOrCallback === 'function' ? gaxOptionsOrCallback : cb!;

    const table = this.cluster.instance.table(tableId);

    this.bigtable.request<
      LROperation<
        google.bigtable.admin.v2.ITable,
        google.bigtable.admin.v2.IRestoreTableMetadata
      >
    >(
      {
        client: 'BigtableTableAdminClient',
        method: 'restoreTable',
        reqOpts: {
          parent: this.cluster.name,
          tableId: table.name,
          backup: this.name,
        },
        gaxOpts,
      },
      (err, operation) => {
        if (err) {
          callback(err, null, operation);
          return;
        }

        callback(err, table, operation);
      }
    );
  }

  setMetadata(
    fields: ModifiableBackupFields,
    gaxOptions?: CallOptions
  ): Promise<SetMetadataResponse>;
  setMetadata(fields: ModifiableBackupFields, callback: SetMetadataCallback): void;
  setMetadata(
    fields: ModifiableBackupFields,
    gaxOptions: CallOptions,
    callback: SetMetadataCallback
  ): void;
  /**
   * Updates this pending or completed Cloud Bigtable Backup.
   *
   * @param {ModifiableBackupFields} metadata - The fields to be updated.
   * @param {CallOptions | SetMetadataCallback} [gaxOptionsOrCallback]
   * @param {SetMetadataCallback} [cb]
   * @return {void | Promise<SetMetadataResponse>}
   */
  setMetadata(
    fields: ModifiableBackupFields,
    gaxOptionsOrCallback?: CallOptions | SetMetadataCallback,
    cb?: SetMetadataCallback
  ): void | Promise<SetMetadataResponse> {
    const gaxOpts =
      typeof gaxOptionsOrCallback === 'object' ? gaxOptionsOrCallback : {};
    const callback =
      typeof gaxOptionsOrCallback === 'function' ? gaxOptionsOrCallback : cb!;

    const {expireTime, ...restFields} = fields;

    const backup: IBackup = {
      name: this.name,
      ...restFields,
    };

    if (expireTime) {
      if (expireTime instanceof Date) {
        backup.expireTime = new PreciseDate(expireTime).toStruct();
      } else if (expireTime.seconds) {
        backup.expireTime = expireTime;
      }
    }

    const reqOpts: google.bigtable.admin.v2.IUpdateBackupRequest = {
      backup,
      updateMask: {
        paths: [],
      },
    };

    const fieldsForMask = ['expireTime'];
    fieldsForMask.forEach(field => {
      if (fields.hasOwnProperty(field)) {
        reqOpts.updateMask!.paths!.push(snakeCase(field));
      }
    });

    this.bigtable.request<IBackup>(
      {
        client: 'BigtableTableAdminClient',
        method: 'updateBackup',
        reqOpts,
        gaxOpts,
      },
      (err, resp) => {
        if (resp) {
          this.metadata = resp;
        }

        callback(err, this, this.metadata);
      }
    );
  }
}

/*! Developer Documentation
 *
 * All async methods (except for streams) will return a Promise in the event
 * that a callback is omitted.
 */
promisifyAll(Backup, {exclude: ['expireDate', 'startDate', 'endDate']});

/**
 * Reference to the {@link Backup} class.
 * @name module:@google-cloud/bigtable.Backup
 * @see Backup
 */
