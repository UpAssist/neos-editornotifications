<?php

declare(strict_types=1);

namespace UpAssist\Neos\EditorNotifications\Domain\Model;

use Doctrine\ORM\Mapping as ORM;
use Neos\Flow\Annotations as Flow;
use Neos\Neos\Domain\Model\User;

/**
 * @Flow\Entity
 * @ORM\Table(name="upassist_neos_editornotifications_notification")
 */
class Notification
{
    /**
     * @var string
     * @Flow\Validate(type="NotEmpty")
     * @Flow\Validate(type="StringLength", options={"minimum"=1, "maximum"=255})
     */
    protected string $title = '';

    /**
     * @var string
     * @ORM\Column(type="text")
     */
    protected string $content = '';

    /**
     * @var \DateTime
     */
    protected \DateTime $createdAt;

    /**
     * @var \DateTime|null
     * @ORM\Column(nullable=true)
     */
    protected ?\DateTime $publishedAt = null;

    /**
     * @var \DateTime|null
     * @ORM\Column(nullable=true)
     */
    protected ?\DateTime $showFrom = null;

    /**
     * @var \DateTime|null
     * @ORM\Column(nullable=true)
     */
    protected ?\DateTime $showUntil = null;

    /**
     * @var \DateTime|null
     * @ORM\Column(nullable=true)
     */
    protected ?\DateTime $archivedAt = null;

    /**
     * @var User|null
     * @ORM\ManyToOne
     */
    protected ?User $createdBy = null;

    public function __construct()
    {
        $this->createdAt = new \DateTime();
    }

    public function getTitle(): string
    {
        return $this->title;
    }

    public function setTitle(string $title): void
    {
        $this->title = trim($title);
    }

    public function getContent(): string
    {
        return $this->content;
    }

    public function setContent(string $content): void
    {
        $this->content = trim($content);
    }

    public function getCreatedAt(): \DateTime
    {
        return $this->createdAt;
    }

    public function getPublishedAt(): ?\DateTime
    {
        return $this->publishedAt;
    }

    public function setPublishedAt(?\DateTime $publishedAt): void
    {
        $this->publishedAt = $publishedAt;
    }

    public function getShowFrom(): ?\DateTime
    {
        return $this->showFrom;
    }

    public function setShowFrom(?\DateTime $showFrom): void
    {
        $this->showFrom = $showFrom;
    }

    public function getShowUntil(): ?\DateTime
    {
        return $this->showUntil;
    }

    public function setShowUntil(?\DateTime $showUntil): void
    {
        $this->showUntil = $showUntil;
    }

    public function getArchivedAt(): ?\DateTime
    {
        return $this->archivedAt;
    }

    public function setArchivedAt(?\DateTime $archivedAt): void
    {
        $this->archivedAt = $archivedAt;
    }

    public function getCreatedBy(): ?User
    {
        return $this->createdBy;
    }

    public function setCreatedBy(?User $createdBy): void
    {
        $this->createdBy = $createdBy;
    }

    public function isDraft(): bool
    {
        return $this->publishedAt === null;
    }

    public function isArchived(): bool
    {
        return $this->archivedAt !== null;
    }

    public function isScheduled(\DateTime $now): bool
    {
        return $this->publishedAt !== null
            && $this->archivedAt === null
            && $this->showFrom !== null
            && $this->showFrom > $now;
    }

    public function isExpired(\DateTime $now): bool
    {
        return $this->showUntil !== null && $this->showUntil < $now;
    }

    public function isActive(\DateTime $now): bool
    {
        if ($this->publishedAt === null || $this->archivedAt !== null) {
            return false;
        }

        if ($this->showFrom !== null && $this->showFrom > $now) {
            return false;
        }

        if ($this->showUntil !== null && $this->showUntil < $now) {
            return false;
        }

        return true;
    }
}
