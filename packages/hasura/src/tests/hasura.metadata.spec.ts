import { Test, TestingModule } from '@nestjs/testing';
import { HasuraModule } from '../hasura.module';
import * as path from 'path';
import { INestApplication, Injectable } from '@nestjs/common';
import { TrackedHasuraEventHandler } from '../hasura.decorators';
import * as fs from 'fs';
import { safeLoad } from 'js-yaml';

@Injectable()
class TestEventHandlerService {
  @TrackedHasuraEventHandler({
    tableName: 'default_table',
    triggerName: 'default_table_event_handler',
    definition: {
      type: 'insert',
    },
  })
  public defaultHandler() {
    console.log('default');
  }

  @TrackedHasuraEventHandler({
    databaseName: 'additional',
    tableName: 'additional_table',
    triggerName: 'additional_table_event_handler',
    definition: {
      type: 'delete',
    },
  })
  public additionalHandler() {
    console.log('additional');
  }
}

describe('Hasura Metadata', () => {
  describe('v3 metadata', () => {
    let app: INestApplication;

    const v3MetadataPath = path.join(
      __dirname,
      '../../test/__fixtures__/hasura/metadata'
    );

    // Ensure that the filesystem is clean so that we can ensure proper metadata comparison
    const tables = ['default', 'additional'];
    tables.forEach((x) => {
      const destinationPath = path.join(
        v3MetadataPath,
        `databases/${x}/tables/public_${x}_table.yaml`
      );
      if (fs.existsSync(destinationPath)) {
        fs.unlinkSync(destinationPath);
      }
      fs.copyFileSync(`${destinationPath}.tmpl`, destinationPath);
    });

    beforeAll(async () => {
      const moduleFixture: TestingModule = await Test.createTestingModule({
        imports: [
          HasuraModule.forRoot(HasuraModule, {
            webhookConfig: {
              secretFactory: 'secret',
              secretHeader: 'NESTJS_SECRET_HEADER',
            },
            managedMetaDataConfig: {
              dirPath: v3MetadataPath,
              secretHeaderEnvName: 'NESTJS_WEBHOOK_SECRET_HEADER_VALUE',
              nestEndpointEnvName: 'NESTJS_EVENT_WEBHOOK_ENDPOINT',
              defaultEventRetryConfig: {
                intervalInSeconds: 15,
                numRetries: 3,
                timeoutInSeconds: 100,
                toleranceSeconds: 21600,
              },
            },
          }),
        ],
        providers: [TestEventHandlerService],
      }).compile();

      app = moduleFixture.createNestApplication();
      await app.init();
    });

    it.each([['default'], ['additional']])(
      'manages event handler metadata: %s database',
      (d) => {
        const tablePath = path.join(
          v3MetadataPath,
          `databases/${d}/tables/public_${d}_table.yaml`
        );

        const actual = fs.readFileSync(tablePath, 'utf-8');
        const expected = fs.readFileSync(`${tablePath}.expected`, 'utf-8');

        expect(safeLoad(actual)).toEqual(safeLoad(expected));
      }
    );
  });
});
