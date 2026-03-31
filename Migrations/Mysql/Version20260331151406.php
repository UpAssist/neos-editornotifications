<?php

declare(strict_types=1);

namespace Neos\Flow\Persistence\Doctrine\Migrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

/**
 * Auto-generated Migration: Please modify to your needs!
 */
final class Version20260331151406 extends AbstractMigration
{
    public function getDescription(): string
    {
        return '';
    }

    public function up(Schema $schema): void
    {
        $this->abortIf(
            !$this->connection->getDatabasePlatform() instanceof \Doctrine\DBAL\Platforms\MariaDb1027Platform,
            "Migration can only be executed safely on '\Doctrine\DBAL\Platforms\MariaDb1027Platform'."
        );

        $this->addSql('CREATE TABLE upassist_neos_editornotifications_notification (persistence_object_identifier VARCHAR(40) NOT NULL, createdby VARCHAR(40) DEFAULT NULL, title VARCHAR(255) NOT NULL, content LONGTEXT NOT NULL, createdat DATETIME NOT NULL, publishedat DATETIME DEFAULT NULL, showfrom DATETIME DEFAULT NULL, showuntil DATETIME DEFAULT NULL, archivedat DATETIME DEFAULT NULL, INDEX IDX_E6672D3E46D262E0 (createdby), PRIMARY KEY(persistence_object_identifier)) DEFAULT CHARACTER SET utf8mb4 COLLATE `utf8mb4_unicode_ci` ENGINE = InnoDB');
        $this->addSql('CREATE TABLE upassist_neos_editornotifications_notificationreadstate (persistence_object_identifier VARCHAR(40) NOT NULL, notification VARCHAR(40) DEFAULT NULL, user VARCHAR(40) DEFAULT NULL, seenat DATETIME DEFAULT NULL, dismissedat DATETIME DEFAULT NULL, INDEX IDX_B0D8E6C4BF5476CA (notification), INDEX IDX_B0D8E6C48D93D649 (user), UNIQUE INDEX notification_user_unique (notification, user), PRIMARY KEY(persistence_object_identifier)) DEFAULT CHARACTER SET utf8mb4 COLLATE `utf8mb4_unicode_ci` ENGINE = InnoDB');
        $this->addSql('ALTER TABLE upassist_neos_editornotifications_notification ADD CONSTRAINT FK_E6672D3E46D262E0 FOREIGN KEY (createdby) REFERENCES neos_neos_domain_model_user (persistence_object_identifier)');
        $this->addSql('ALTER TABLE upassist_neos_editornotifications_notificationreadstate ADD CONSTRAINT FK_B0D8E6C4BF5476CA FOREIGN KEY (notification) REFERENCES upassist_neos_editornotifications_notification (persistence_object_identifier)');
        $this->addSql('ALTER TABLE upassist_neos_editornotifications_notificationreadstate ADD CONSTRAINT FK_B0D8E6C48D93D649 FOREIGN KEY (user) REFERENCES neos_neos_domain_model_user (persistence_object_identifier)');
    }

    public function down(Schema $schema): void
    {
        $this->abortIf(
            !$this->connection->getDatabasePlatform() instanceof \Doctrine\DBAL\Platforms\MariaDb1027Platform,
            "Migration can only be executed safely on '\Doctrine\DBAL\Platforms\MariaDb1027Platform'."
        );

        $this->addSql('ALTER TABLE upassist_neos_editornotifications_notificationreadstate DROP FOREIGN KEY FK_B0D8E6C4BF5476CA');
        $this->addSql('ALTER TABLE upassist_neos_editornotifications_notificationreadstate DROP FOREIGN KEY FK_B0D8E6C48D93D649');
        $this->addSql('ALTER TABLE upassist_neos_editornotifications_notification DROP FOREIGN KEY FK_E6672D3E46D262E0');
        $this->addSql('DROP TABLE upassist_neos_editornotifications_notificationreadstate');
        $this->addSql('DROP TABLE upassist_neos_editornotifications_notification');
    }
}
